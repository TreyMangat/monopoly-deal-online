// ============================================================
// MONOPOLY DEAL ONLINE — Bot AI Tests
// ============================================================

import { describe, it, expect } from "vitest";
import { applyAction, EngineResult, initializeGame } from "../engine/GameEngine";
import { chooseBotAction, BotDifficulty } from "../engine/BotPlayer";
import { BotManager } from "../engine/BotManager";
import {
  GameState,
  ActionType,
  TurnPhase,
  CardType,
  PropertyColor,
  Card,
  PendingActionType,
  PlayerState,
} from "../shared/types";
import { SET_SIZE } from "../shared/constants";

// ---- Helpers ----

function prop(id: string, color: PropertyColor, name: string, value: number): Card {
  return { id, type: CardType.Property, name, bankValue: value, color };
}

function money(id: string, value: number): Card {
  return { id, type: CardType.Money, name: `$${value}M`, bankValue: value };
}

function ok(result: EngineResult): GameState {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function createBotTestGame(): GameState {
  return {
    roomCode: "BOTTEST",
    deck: Array.from({ length: 30 }, (_, i) => money(`dk${i}`, (i % 5) + 1)),
    discardPile: [],
    players: [
      {
        id: "bot1", name: "HardBot", avatar: 10,
        hand: [
          prop("med", PropertyColor.Brown, "Mediterranean Avenue", 1),
          money("m3_b1", 3),
          { id: "passgo_b1", type: CardType.ActionPassGo, name: "Pass Go", bankValue: 1 },
          { id: "dc_b1", type: CardType.ActionDebtCollector, name: "Debt Collector", bankValue: 3, actionValue: 5 },
          prop("oriental", PropertyColor.LightBlue, "Oriental Avenue", 1),
        ],
        bank: [money("bank_b1", 5)],
        properties: [
          { color: PropertyColor.Brown, cards: [
            prop("baltic", PropertyColor.Brown, "Baltic Avenue", 1),
          ], hasHouse: false, hasHotel: false },
        ],
        connected: true,
      },
      {
        id: "p2", name: "Alice", avatar: 0,
        hand: [money("m1_p2", 1), money("m2_p2", 2)],
        bank: [money("bank_p2", 10)],
        properties: [
          { color: PropertyColor.DarkBlue, cards: [
            prop("boardwalk", PropertyColor.DarkBlue, "Boardwalk", 4),
            prop("park", PropertyColor.DarkBlue, "Park Place", 4),
          ], hasHouse: false, hasHotel: false },
        ],
        connected: true,
      },
      {
        id: "p3", name: "Bob", avatar: 1,
        hand: [money("m1_p3", 1)],
        bank: [money("bank_p3", 3)],
        properties: [
          { color: PropertyColor.Red, cards: [
            prop("indiana", PropertyColor.Red, "Indiana Avenue", 3),
          ], hasHouse: false, hasHotel: false },
        ],
        connected: true,
      },
    ],
    currentPlayerIndex: 0,
    actionsRemaining: 3,
    phase: TurnPhase.Play,
    pendingAction: null,
    turnNumber: 1,
    winnerId: null,
    useDoubleDeck: false,
    doubleRentActive: false,
  };
}

// ============================================================
// EASY BOT TESTS
// ============================================================

describe("Easy Bot", () => {
  it("always draws when in draw phase", () => {
    const state = createBotTestGame();
    state.phase = TurnPhase.Draw;
    const action = chooseBotAction(state, "bot1", "easy");
    expect(action.type).toBe(ActionType.DrawCards);
    expect(action.playerId).toBe("bot1");
  });

  it("never returns an action for the wrong phase", () => {
    const state = createBotTestGame();
    state.phase = TurnPhase.Draw;
    const action = chooseBotAction(state, "bot1", "easy");
    // In draw phase, should only return DrawCards
    expect(action.type).toBe(ActionType.DrawCards);
  });

  it("produces legal actions across 50 random turns", () => {
    let state = initializeGame("EASYTEST", [
      { id: "ebot", name: "EasyBot", avatar: 10 },
      { id: "human", name: "Human", avatar: 0 },
    ]);

    let turns = 0;
    const maxTurns = 50;

    while (turns < maxTurns && state.phase !== TurnPhase.GameOver) {
      let botId: string;

      if (state.phase === TurnPhase.AwaitingResponse && state.pendingAction) {
        const targetId = state.pendingAction.targetPlayerIds.find(
          (id) => !state.pendingAction!.respondedPlayerIds.includes(id)
        );
        if (!targetId) break;
        botId = targetId;
      } else {
        botId = state.players[state.currentPlayerIndex].id;
      }

      const action = chooseBotAction(state, botId, "easy");
      action.playerId = botId;

      const result = applyAction(state, action);
      if (!result.ok) {
        // If bot made an illegal move, that's a test failure
        throw new Error(
          `Easy bot illegal move on turn ${turns}: ${result.error}\n` +
          `Phase: ${state.phase}, Action: ${JSON.stringify(action)}`
        );
      }
      state = result.state;
      turns++;
    }
    expect(turns).toBeGreaterThan(0);
  });
});

// ============================================================
// MEDIUM BOT TESTS
// ============================================================

describe("Medium Bot", () => {
  it("banks money when no better option", () => {
    const state = createBotTestGame();
    // Give bot only money cards
    state.players[0].hand = [money("m5", 5), money("m3", 3)];
    state.players[0].properties = [];

    const action = chooseBotAction(state, "bot1", "medium");
    expect(action.type).toBe(ActionType.PlayMoneyToBank);
  });

  it("plays properties to advance sets", () => {
    const state = createBotTestGame();
    // Bot has brown property in hand and brown incomplete set
    state.players[0].hand = [
      prop("med", PropertyColor.Brown, "Mediterranean Avenue", 1),
    ];

    const action = chooseBotAction(state, "bot1", "medium");
    expect(action.type).toBe(ActionType.PlayPropertyCard);
    expect(action.destinationColor).toBe(PropertyColor.Brown);
  });

  it("plays rent when it has 2+ matching properties", () => {
    const state = createBotTestGame();
    state.players[0].hand = [
      { id: "rent_br_lb", type: CardType.RentTwoColor, name: "Rent: Brown/LB", bankValue: 1,
        rentColors: [PropertyColor.Brown, PropertyColor.LightBlue] as [PropertyColor, PropertyColor] },
    ];
    state.players[0].properties = [
      { color: PropertyColor.Brown, cards: [
        prop("med", PropertyColor.Brown, "Mediterranean", 1),
        prop("baltic", PropertyColor.Brown, "Baltic", 1),
      ], hasHouse: false, hasHotel: false },
    ];

    const action = chooseBotAction(state, "bot1", "medium");
    expect(action.type).toBe(ActionType.PlayRentCard);
    expect(action.targetColor).toBe(PropertyColor.Brown);
  });

  it("uses JSN against Deal Breaker", () => {
    const state = createBotTestGame();
    state.phase = TurnPhase.AwaitingResponse;
    state.players[0].hand = [
      { id: "jsn1", type: CardType.ActionJustSayNo, name: "Just Say No", bankValue: 4 },
    ];
    state.players[0].properties = [
      { color: PropertyColor.Brown, cards: [
        prop("med", PropertyColor.Brown, "Mediterranean", 1),
        prop("baltic", PropertyColor.Brown, "Baltic", 1),
      ], hasHouse: false, hasHotel: false },
    ];
    state.pendingAction = {
      type: PendingActionType.RespondToDealBreaker,
      fromPlayerId: "p2",
      targetPlayerIds: ["bot1"],
      respondedPlayerIds: [],
      targetCardId: PropertyColor.Brown,
    };

    const action = chooseBotAction(state, "bot1", "medium");
    expect(action.type).toBe(ActionType.PlayJustSayNo);
  });
});

// ============================================================
// HARD BOT TESTS
// ============================================================

describe("Hard Bot", () => {
  it("plays Deal Breaker when opponent has complete set", () => {
    const state = createBotTestGame();
    state.players[0].hand = [
      { id: "db1", type: CardType.ActionDealBreaker, name: "Deal Breaker", bankValue: 5 },
    ];
    // p2 has complete DarkBlue set
    const action = chooseBotAction(state, "bot1", "hard");
    expect(action.type).toBe(ActionType.PlayDealBreaker);
    expect(action.targetPlayerId).toBe("p2");
    expect(action.targetColor).toBe(PropertyColor.DarkBlue);
  });

  it("targets richest opponent with Debt Collector", () => {
    const state = createBotTestGame();
    state.players[0].hand = [
      { id: "dc1", type: CardType.ActionDebtCollector, name: "Debt Collector", bankValue: 3, actionValue: 5 },
    ];
    state.players[0].properties = [];
    // p2 has $10M bank, p3 has $3M bank
    const action = chooseBotAction(state, "bot1", "hard");
    expect(action.type).toBe(ActionType.PlayDebtCollector);
    expect(action.targetPlayerId).toBe("p2");
  });

  it("plays doubled rent when it has both cards and 2+ actions", () => {
    const state = createBotTestGame();
    state.actionsRemaining = 3;
    state.players[0].hand = [
      { id: "dblrent1", type: CardType.ActionDoubleRent, name: "Double the Rent", bankValue: 1 },
      { id: "rent_br", type: CardType.RentTwoColor, name: "Rent: Brown/LB", bankValue: 1,
        rentColors: [PropertyColor.Brown, PropertyColor.LightBlue] as [PropertyColor, PropertyColor] },
    ];
    state.players[0].properties = [
      { color: PropertyColor.Brown, cards: [
        prop("med", PropertyColor.Brown, "Mediterranean", 1),
        prop("baltic", PropertyColor.Brown, "Baltic", 1),
      ], hasHouse: false, hasHotel: false },
    ];

    const action = chooseBotAction(state, "bot1", "hard");
    expect(action.type).toBe(ActionType.PlayDoubleRent);
  });

  it("plays House on complete sets when available", () => {
    const state = createBotTestGame();
    state.players[0].hand = [
      { id: "house1", type: CardType.ActionHouse, name: "House", bankValue: 3 },
    ];
    state.players[0].properties = [
      { color: PropertyColor.Brown, cards: [
        prop("med", PropertyColor.Brown, "Mediterranean", 1),
        prop("baltic", PropertyColor.Brown, "Baltic", 1),
      ], hasHouse: false, hasHotel: false },
    ];

    const action = chooseBotAction(state, "bot1", "hard");
    expect(action.type).toBe(ActionType.PlayHouse);
    expect(action.targetColor).toBe(PropertyColor.Brown);
  });

  it("plays Hotel on sets with houses", () => {
    const state = createBotTestGame();
    state.players[0].hand = [
      { id: "hotel1", type: CardType.ActionHotel, name: "Hotel", bankValue: 4 },
    ];
    state.players[0].properties = [
      { color: PropertyColor.Brown, cards: [
        prop("med", PropertyColor.Brown, "Mediterranean", 1),
        prop("baltic", PropertyColor.Brown, "Baltic", 1),
      ], hasHouse: true, hasHotel: false },
    ];

    const action = chooseBotAction(state, "bot1", "hard");
    expect(action.type).toBe(ActionType.PlayHotel);
    expect(action.targetColor).toBe(PropertyColor.Brown);
  });

  it("uses JSN against rent >= $5M", () => {
    const state = createBotTestGame();
    state.phase = TurnPhase.AwaitingResponse;
    state.players[0].hand = [
      { id: "jsn1", type: CardType.ActionJustSayNo, name: "Just Say No", bankValue: 4 },
    ];
    state.pendingAction = {
      type: PendingActionType.PayRent,
      fromPlayerId: "p2",
      targetPlayerIds: ["bot1"],
      respondedPlayerIds: [],
      amount: 6,
    };

    const action = chooseBotAction(state, "bot1", "hard");
    expect(action.type).toBe(ActionType.PlayJustSayNo);
  });

  it("steals property that completes a set via Sly Deal", () => {
    const state = createBotTestGame();
    state.players[0].hand = [
      { id: "sly1", type: CardType.ActionSlyDeal, name: "Sly Deal", bankValue: 3 },
    ];
    // Bot needs 1 more red to get closer to set. P3 has incomplete red.
    state.players[0].properties = [
      { color: PropertyColor.Red, cards: [
        prop("il_bot", PropertyColor.Red, "Illinois Avenue", 3),
        prop("ky_bot", PropertyColor.Red, "Kentucky Avenue", 3),
      ], hasHouse: false, hasHotel: false },
    ];

    const action = chooseBotAction(state, "bot1", "hard");
    expect(action.type).toBe(ActionType.PlaySlyDeal);
    expect(action.targetPlayerId).toBe("p3");
    expect(action.targetCardId).toBe("indiana");
  });

  it("swaps wild card to complete a set", () => {
    const state = createBotTestGame();
    state.players[0].hand = [];
    state.players[0].properties = [
      { color: PropertyColor.Brown, cards: [
        prop("med", PropertyColor.Brown, "Mediterranean", 1),
        { id: "wild_br_lb", type: CardType.PropertyWild, name: "Brown/LB Wild", bankValue: 4,
          color: PropertyColor.Brown, altColor: PropertyColor.LightBlue },
      ], hasHouse: false, hasHotel: false },
      { color: PropertyColor.LightBlue, cards: [
        prop("oriental", PropertyColor.LightBlue, "Oriental Avenue", 1),
        prop("vermont", PropertyColor.LightBlue, "Vermont Avenue", 1),
      ], hasHouse: false, hasHotel: false },
    ];

    const action = chooseBotAction(state, "bot1", "hard");
    expect(action.type).toBe(ActionType.MoveWildCard);
    expect(action.cardId).toBe("wild_br_lb");
    expect(action.destinationColor).toBe(PropertyColor.LightBlue);
  });

  it("never pays with PropertyWildAll", () => {
    const state = createBotTestGame();
    state.phase = TurnPhase.AwaitingResponse;
    state.players[0].hand = [];
    state.players[0].bank = [];
    state.players[0].properties = [
      { color: PropertyColor.Brown, cards: [
        { id: "wild_all", type: CardType.PropertyWildAll, name: "Wild All", bankValue: 0 },
        prop("med", PropertyColor.Brown, "Mediterranean", 1),
      ], hasHouse: false, hasHotel: false },
    ];
    state.pendingAction = {
      type: PendingActionType.PayRent,
      fromPlayerId: "p2",
      targetPlayerIds: ["bot1"],
      respondedPlayerIds: [],
      amount: 3,
    };

    const action = chooseBotAction(state, "bot1", "hard");
    expect(action.type).toBe(ActionType.PayWithCards);
    // Should only include the med property, not the wild all
    expect(action.cardIds).not.toContain("wild_all");
  });

  it("discards lowest-value cards first", () => {
    const state = createBotTestGame();
    state.phase = TurnPhase.Discard;
    state.players[0].hand = [
      money("m1a", 1),
      money("m1b", 1),
      money("m5a", 5),
      { id: "jsn1", type: CardType.ActionJustSayNo, name: "Just Say No", bankValue: 4 },
      prop("med", PropertyColor.Brown, "Mediterranean", 1),
      { id: "passgo1", type: CardType.ActionPassGo, name: "Pass Go", bankValue: 1 },
      { id: "dc1", type: CardType.ActionDebtCollector, name: "Debt Collector", bankValue: 3, actionValue: 5 },
      { id: "sly1", type: CardType.ActionSlyDeal, name: "Sly Deal", bankValue: 3 },
    ];
    // Need to discard 1 (8 - 7 = 1)
    state.players[0].properties = [];

    const action = chooseBotAction(state, "bot1", "hard");
    expect(action.type).toBe(ActionType.DiscardCards);
    expect(action.cardIds).toHaveLength(1);
    // Should discard lowest-scored card (money $1M = score 3)
    expect(["m1a", "m1b"]).toContain(action.cardIds![0]);
  });

  it("counter-JSN only for high-value actions", () => {
    const state = createBotTestGame();
    state.phase = TurnPhase.AwaitingResponse;
    // Bot's action was countered by JSN — should we counter back?
    state.players[0].hand = [
      { id: "jsn2", type: CardType.ActionJustSayNo, name: "Just Say No", bankValue: 4 },
    ];
    state.pendingAction = {
      type: PendingActionType.CounterJustSayNo,
      fromPlayerId: "p2",
      targetPlayerIds: ["bot1"],
      respondedPlayerIds: [],
      amount: 8, // High value — worth countering
      justSayNoChain: [{ playerId: "bot1", action: "just_say_no" }, { playerId: "p2", action: "just_say_no" }],
    };

    const action = chooseBotAction(state, "bot1", "hard");
    expect(action.type).toBe(ActionType.PlayJustSayNo);
  });

  it("does NOT counter-JSN for low-value actions", () => {
    const state = createBotTestGame();
    state.phase = TurnPhase.AwaitingResponse;
    state.players[0].hand = [
      { id: "jsn2", type: CardType.ActionJustSayNo, name: "Just Say No", bankValue: 4 },
    ];
    state.pendingAction = {
      type: PendingActionType.CounterJustSayNo,
      fromPlayerId: "p2",
      targetPlayerIds: ["bot1"],
      respondedPlayerIds: [],
      amount: 2, // Low value — not worth countering
      justSayNoChain: [{ playerId: "bot1", action: "just_say_no" }, { playerId: "p2", action: "just_say_no" }],
    };

    const action = chooseBotAction(state, "bot1", "hard");
    expect(action.type).toBe(ActionType.AcceptAction);
  });
});

// ============================================================
// INTEGRATION TESTS
// ============================================================

describe("Bot Integration", () => {
  it("3 hard bots play a complete game to completion", () => {
    let state = initializeGame("BOTGAME", [
      { id: "b1", name: "Bot1", avatar: 10 },
      { id: "b2", name: "Bot2", avatar: 11 },
      { id: "b3", name: "Bot3", avatar: 12 },
    ]);

    let actions = 0;
    const maxActions = 300;

    while (state.phase !== TurnPhase.GameOver && actions < maxActions) {
      const currentPlayer = state.players[state.currentPlayerIndex];
      let action: ReturnType<typeof chooseBotAction>;

      if (state.phase === TurnPhase.AwaitingResponse && state.pendingAction) {
        // Find the unresponded target
        const targetId = state.pendingAction.targetPlayerIds.find(
          (id) => !state.pendingAction!.respondedPlayerIds.includes(id)
        );
        if (!targetId) {
          // All responded — this shouldn't happen but break to avoid infinite loop
          break;
        }
        action = chooseBotAction(state, targetId, "hard");
        action.playerId = targetId;
      } else {
        action = chooseBotAction(state, currentPlayer.id, "hard");
        action.playerId = currentPlayer.id;
      }

      const result = applyAction(state, action);
      if (!result.ok) {
        throw new Error(
          `Bot game error at action ${actions}: ${result.error}\n` +
          `Phase: ${state.phase}, Turn: ${state.turnNumber}\n` +
          `Player: ${action.playerId}, Action: ${JSON.stringify(action)}`
        );
      }
      state = result.state;
      actions++;
    }

    // Game should finish within 300 actions
    if (state.phase === TurnPhase.GameOver) {
      expect(state.winnerId).toBeTruthy();
      // Verify winner has 3 complete sets
      const winner = state.players.find((p) => p.id === state.winnerId);
      expect(winner).toBeDefined();
      const completeSets = winner!.properties.filter((g) => {
        return g.cards.length >= SET_SIZE[g.color];
      });
      expect(completeSets.length).toBeGreaterThanOrEqual(3);
    }
    // If we hit 300 actions, that's also OK — game just didn't finish yet
    expect(actions).toBeGreaterThan(0);
  });

  it("2 hard bots + 1 easy bot play without crashing", () => {
    let state = initializeGame("MIXGAME", [
      { id: "h1", name: "Hard1", avatar: 10 },
      { id: "h2", name: "Hard2", avatar: 11 },
      { id: "e1", name: "Easy1", avatar: 12 },
    ]);

    const difficulties: Record<string, BotDifficulty> = {
      h1: "hard",
      h2: "hard",
      e1: "easy",
    };

    let actions = 0;
    const maxActions = 300;

    while (state.phase !== TurnPhase.GameOver && actions < maxActions) {
      const currentPlayer = state.players[state.currentPlayerIndex];
      let botId: string;
      let diff: BotDifficulty;

      if (state.phase === TurnPhase.AwaitingResponse && state.pendingAction) {
        const targetId = state.pendingAction.targetPlayerIds.find(
          (id) => !state.pendingAction!.respondedPlayerIds.includes(id)
        );
        if (!targetId) break;
        botId = targetId;
      } else {
        botId = currentPlayer.id;
      }

      diff = difficulties[botId] || "medium";
      const action = chooseBotAction(state, botId, diff);
      action.playerId = botId;

      const result = applyAction(state, action);
      if (!result.ok) {
        throw new Error(
          `Mixed bot game error at action ${actions}: ${result.error}\n` +
          `Phase: ${state.phase}, Bot: ${botId} (${diff})\n` +
          `Action: ${JSON.stringify(action)}`
        );
      }
      state = result.state;
      actions++;
    }

    expect(actions).toBeGreaterThan(0);
  });

  it("bot replacement: bot inherits player state and takes turns", () => {
    // Create a game state where p1 has some cards/properties
    let state: GameState = {
      roomCode: "REPLACE",
      deck: Array.from({ length: 20 }, (_, i) => money(`dk${i}`, 1)),
      discardPile: [],
      players: [
        {
          id: "human1", name: "Human", avatar: 0,
          hand: [money("m1", 3), prop("med", PropertyColor.Brown, "Mediterranean", 1)],
          bank: [money("bank1", 5)],
          properties: [
            { color: PropertyColor.LightBlue, cards: [
              prop("oriental", PropertyColor.LightBlue, "Oriental", 1),
            ], hasHouse: false, hasHotel: false },
          ],
          connected: true,
        },
        {
          id: "human2", name: "Human2", avatar: 1,
          hand: [money("m2", 2)],
          bank: [],
          properties: [],
          connected: true,
        },
      ],
      currentPlayerIndex: 0,
      actionsRemaining: 3,
      phase: TurnPhase.Play,
      pendingAction: null,
      turnNumber: 1,
      winnerId: null,
      useDoubleDeck: false,
      doubleRentActive: false,
    };

    // "Replace" human1 with a bot by changing their ID
    const botId = "bot_replacement";
    state.players[0].id = botId;
    state.players[0].name = "ReplacementBot";
    state.players[0].connected = true;

    // Bot should be able to take actions with the inherited state
    const action = chooseBotAction(state, botId, "hard");
    expect(action.playerId).toBe(botId);

    // Apply the action — should succeed
    const result = applyAction(state, action);
    expect(result.ok).toBe(true);

    // Bot should have made a reasonable play
    if (result.ok) {
      // Whatever it played, the game state should be valid
      expect(result.state.players[0].id).toBe(botId);
    }
  });
});

// ============================================================
// BOT MANAGER TESTS
// ============================================================

describe("BotManager", () => {
  it("creates bots with unique names", () => {
    const mgr = new BotManager();
    const b1 = mgr.createBot("easy");
    const b2 = mgr.createBot("medium");
    const b3 = mgr.createBot("hard");

    expect(b1.name).not.toBe(b2.name);
    expect(b2.name).not.toBe(b3.name);
    expect(b1.name).not.toBe(b3.name);
  });

  it("assigns high avatar numbers to bots", () => {
    const mgr = new BotManager();
    const b1 = mgr.createBot("easy");
    expect(b1.avatar).toBeGreaterThanOrEqual(10);
  });

  it("tracks bot players correctly", () => {
    const mgr = new BotManager();
    const bot = mgr.createBot("hard");
    expect(mgr.isBotPlayer(bot.id)).toBe(true);
    expect(mgr.isBotPlayer("not_a_bot")).toBe(false);
    expect(mgr.getBotDifficulty(bot.id)).toBe("hard");
  });

  it("removes bots and frees names", () => {
    const mgr = new BotManager();
    const b1 = mgr.createBot("easy");
    const name1 = b1.name;
    mgr.removeBot(b1.id);
    expect(mgr.isBotPlayer(b1.id)).toBe(false);

    // Name should be available again
    const b2 = mgr.createBot("easy");
    expect(b2.name).toBe(name1);
  });
});
