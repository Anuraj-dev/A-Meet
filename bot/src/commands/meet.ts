import { InteractionContextType, SlashCommandBuilder } from 'discord.js';

// The single `/meet` slash command with two subcommands. Slash commands only —
// the bot needs no privileged Message Content intent. Guild-only: /meet create
// must post a PUBLIC channel embed, and in a DM the "public" post would just be
// the DM itself.
export const meetCommand = new SlashCommandBuilder()
  .setName('meet')
  .setDescription('A-Meet meetings')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName('link')
      .setDescription('Link your Discord account to your A-Meet account'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('Start an instant A-Meet meeting and post the join link'),
  );

/** JSON payload for slash-command registration. */
export const meetCommandJSON = meetCommand.toJSON();
