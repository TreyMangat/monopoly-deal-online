// ============================================================
// MONOPOLY DEAL ONLINE — Bot Manager
// ============================================================
// Manages bot lifecycle: creation, naming, difficulty tracking.
// Wraps BotPlayer.chooseBotAction for use by GameRoom.
// ============================================================

import { GameState, PlayerAction } from "../shared/types";
import { chooseBotAction, BotDifficulty } from "./BotPlayer";
export type { BotDifficulty } from "./BotPlayer";

export interface BotInfo {
  id: string;
  name: string;
  avatar: number;
  difficulty: BotDifficulty;
}

const BOT_NAMES = [
  "DealBot",
  "CardShark",
  "Mr. Money",
  "RentKing",
  "SetCollector",
  "WildCard",
];

const BOT_AVATARS = [10, 11, 12, 13, 14, 15];

export class BotManager {
  private bots: Map<string, BotInfo> = new Map();
  private usedNames: Set<string> = new Set();
  private nextAvatarIndex: number = 0;

  createBot(difficulty: BotDifficulty): BotInfo {
    const id = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Pick a unique name
    let name = "Bot";
    for (const n of BOT_NAMES) {
      if (!this.usedNames.has(n)) {
        name = n;
        break;
      }
    }
    this.usedNames.add(name);

    const avatar = BOT_AVATARS[this.nextAvatarIndex % BOT_AVATARS.length];
    this.nextAvatarIndex++;

    const bot: BotInfo = { id, name, avatar, difficulty };
    this.bots.set(id, bot);
    return bot;
  }

  removeBot(botId: string): void {
    const bot = this.bots.get(botId);
    if (bot) {
      this.usedNames.delete(bot.name);
      this.bots.delete(botId);
    }
  }

  getBotAction(
    state: GameState,
    botId: string,
    difficulty: BotDifficulty
  ): PlayerAction {
    return chooseBotAction(state, botId, difficulty);
  }

  isBotPlayer(playerId: string): boolean {
    return this.bots.has(playerId);
  }

  getBotDifficulty(botId: string): BotDifficulty | undefined {
    return this.bots.get(botId)?.difficulty;
  }

  getBotInfo(botId: string): BotInfo | undefined {
    return this.bots.get(botId);
  }

  getAllBots(): BotInfo[] {
    return Array.from(this.bots.values());
  }

  /** Register an existing bot (e.g. when replacing a disconnected player) */
  registerBot(info: BotInfo): void {
    this.bots.set(info.id, info);
    this.usedNames.add(info.name);
  }

  clear(): void {
    this.bots.clear();
    this.usedNames.clear();
    this.nextAvatarIndex = 0;
  }
}
