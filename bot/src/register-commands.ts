import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { loadBotEnv } from './config/env.js';
import { meetCommandJSON } from './commands/meet.js';

// One-shot ops script: (re)register the /meet slash command with Discord.
//   npm --prefix bot run register
// With DISCORD_GUILD_ID set it registers to that guild (updates are instant —
// use this in development). Without it, commands register globally (propagation
// can take up to an hour). Run again whenever the command definition changes.
async function main(): Promise<void> {
  const config = loadBotEnv();
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const body = [meetCommandJSON];

  if (config.discordGuildId) {
    await rest.put(
      Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
      { body },
    );
    console.log(`Registered ${body.length} command(s) to guild ${config.discordGuildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(config.discordClientId), { body });
    console.log(`Registered ${body.length} command(s) globally (may take up to 1h to appear).`);
  }
}

main().catch((err) => {
  console.error('Command registration failed:', err);
  process.exit(1);
});
