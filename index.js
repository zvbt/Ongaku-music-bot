const { Client, GatewayIntentBits, REST, Routes, PermissionsBitField, GuildMember, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const dotenv = require ('dotenv');

dotenv.config();

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildVoiceStates, 
        GatewayIntentBits.GuildMembers
    ] 
});

let currentConnection = null;
let currentPlayer = null;

const commands = [
    {
        name: 'play',
        description: 'Plays K-Pop or J-Pop in your current voice channel',
        options: [
            {
                name: 'station',
                type: 3, // STRING type
                description: 'Choose the radio station to play',
                required: true,
                choices: [
                    { name: 'K-Pop', value: 'kpop' },
                    { name: 'J-Pop', value: 'jpop' }
                ],
            },
        ],
    },
    {
        name: 'stop',
        description: 'Stops the radio and disconnects the bot from the voice channel',
    },
    {
        name: 'info',
        description: 'Displays information about the bot',
    },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
    console.log('Ongaku Bot is online!');
    try {
        const guilds = await client.guilds.fetch();

        guilds.forEach(async (guild) => {
            try {
                await rest.put(
                    Routes.applicationGuildCommands(client.user.id, guild.id),
                    { body: commands },
                );
                console.log(`Successfully reloaded application (/) commands for guild ${guild.id}.`);
            } catch (error) {
                console.error(`Failed to register commands for guild ${guild.id}:`, error);
            }
        });
    } catch (error) {
        console.error('Error fetching guilds:', error);
    }
});

client.on('guildCreate', async (guild) => {
    console.log(`Joined a new guild: ${guild.id}`);

    try {
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, guild.id),
            { body: commands },
        );
        console.log(`Successfully registered commands for new guild ${guild.id}.`);
    } catch (error) {
        console.error(`Failed to register commands for new guild ${guild.id}:`, error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;
    const member = interaction.member;

    if (commandName === 'play') {
        if (!member.voice.channel) {
            return await interaction.reply('You need to join a voice channel first!');
        }

        if (currentConnection) {
            currentConnection.destroy();
        }

        const station = options.get('station')?.value;
        const currentStation = station === 'kpop' ? 'K-Pop' : 'J-Pop';

        const radioUrl = station === 'kpop' ? process.env.KPOP : process.env.JPOP;
        const connection = joinVoiceChannel({
            channelId: member.voice.channel.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
        });

        currentConnection = connection;

        const player = createAudioPlayer();
        const resource = createAudioResource(radioUrl);

        player.play(resource);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Playing, () => {
            console.log(`The ${currentStation} radio is playing!`);
        });

        player.on('error', error => {
            console.error('Error:', error);
        });

        await interaction.reply(`Playing the ${currentStation} radio!`);
    } else if (commandName === 'stop') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return await interaction.reply('You need to be an administrator to stop the bot.');
        }

        if (!currentConnection) {
            return await interaction.reply('The bot is not currently connected to a voice channel.');
        }

        currentConnection.destroy();
        currentConnection = null;
        currentPlayer = null;

        await interaction.reply('Stopped the radio and disconnected from the voice channel.');
        await interaction.r
    } else if (commandName === 'info') {
        const guilds = await client.guilds.fetch();
        const totalMembers = (await Promise.all(
            guilds.map(async (guild) => {
                try {
                    const detailedGuild = await client.guilds.fetch(guild.id);
                    return detailedGuild.memberCount;
                } catch (error) {
                    console.error(`Failed to fetch details for guild ${guild.id}:`, error);
                    return 0;
                }
            })
        )).reduce((total, count) => total + count, 0);

        const botInfoEmbed = new EmbedBuilder()
            .setColor('#f0bfe9')
            .setTitle('Ongaku music bot')
            .setURL('https://discord.com/oauth2/authorize?client_id=1271103628127506522&permissions=2184203264&integration_type=0&scope=bot')
            .setThumbnail('https://ongaku.zvbt.space/favicon.png')
            .setDescription('Discover the best of Jpop and Kpop on Ongaku your go-to music bot for streaming all your favorite Japanese and Korean pop music hits. Dive into the latest tracks, timeless classics, and carefully curated playlists that celebrate the vibrant world of Jpop and Kpop music.')
            .setTimestamp()
            .addFields(
                { name: 'Stats', value: `${totalMembers} users in ${client.guilds.cache.size} servers.` || 'N/A' },
            )
            .setFooter({ text: `Click the link above to invite the bot!`, iconURL: client.user?.displayAvatarURL() || ''});

        await interaction.reply({ embeds: [botInfoEmbed] });
    }
});

client.login(process.env.DISCORD_TOKEN);
