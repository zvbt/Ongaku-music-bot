const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, REST } = require('discord.js');
const { Manager } = require('erela.js');
const dotenv = require('dotenv');

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Lavalink configuration
const manager = new Manager({
    nodes: [
        {
            host: process.env.LAVALINK,
            port: 2333,
            password: process.env.LAVALINK_PASSWORD,
            secure: false,
        },
    ],
    send(id, payload) {
        const guild = client.guilds.cache.get(id);
        if (guild) guild.shard.send(payload);
    },
});

client.once('ready', () => {
    console.log('Ongaku Bot is online!');
    console.log(`Connected Nodes: ${manager.nodes.map(node => node.host).join(', ')}`);
    manager.init(client.user.id);


    client.user.setPresence({
        activities: [{ 
            name: 'to BANGERS',
            type: 'LISTENING'// (PLAYING, STREAMING, LISTENING, WATCHING)
        }],
        status: 'online'// (online, idle, dnd, invisible)
    });
});


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

    // Register commands for the new guild
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



client.on('raw', (d) => manager.updateVoiceState(d));

manager.on('nodeConnect', node => console.log(`Node ${node.options.identifier} connected.`));
manager.on('nodeError', (node, error) => console.error(`Node ${node.options.identifier} had an error: ${error.message}`));


client.on('raw', (d) => manager.updateVoiceState(d));

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;
    const member = interaction.member;

    if (commandName === 'play') {
        if (!member.voice.channel) {
            return await interaction.reply('You need to join a voice channel first!');
        }

        const station = options.getString('station');
        const query = station === 'kpop' ? process.env.KPOP : process.env.JPOP;

        const player = manager.create({
            guild: interaction.guild.id,
            voiceChannel: member.voice.channel.id,
            textChannel: interaction.channel.id,
        });

        player.connect();

        const searchResult = await manager.search(query, interaction.user);

        if (searchResult.loadType === 'LOAD_FAILED') {
            return interaction.reply('Failed to load the station.');
        }

        player.queue.add(searchResult.tracks[0]);
        if (!player.playing && !player.paused && !player.queue.size) player.play();
        await interaction.reply(`Playing the ${station.toUpperCase()} radio!`);
    } else if (commandName === 'stop') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return await interaction.reply('You need to be an administrator to stop the bot.');
        }

        const player = manager.players.get(interaction.guild.id);
        if (!player) return await interaction.reply('The bot is not currently playing in a voice channel.');

        player.destroy();
        await interaction.reply('Stopped the radio and disconnected from the voice channel.');
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
