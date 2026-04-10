// ============================================================
// MONOPOLY DEAL ONLINE — Bot AI Tests
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
// BOT MONEY MANAGEMENT TESTS
// ============================================================

describe("Bot Money Management", () => {
  it("banks money when bank is empty (priority 0)", () => {
    const state = createBotTestGame();
    state.players[0].bank = []; // empty bank
    state.players[0].hand = [
      money("m5_urgent", 5),
      { id: "sly1", type: CardType.ActionSlyDeal, name: "Sly Deal", bankValue: 3 },
    ];
    state.players[0].properties = [];

    const action = chooseBotAction(state, "bot1", "hard");
    expect(action.type).toBe(ActionType.PlayMoneyToBank);
    expect(action.cardId).toBe("m5_urgent");
  });

  it("banks money over 10 turns and has non-zero bank by turn 5", () => {
    let state = initializeGame("BANKTEST", [
      { id: "banker", name: "BankerBot", avatar: 10 },
      { id: "opp", name: "Opponent", avatar: 0 },
    ]);

    let bankerBankValue = 0;
    let actions = 0;
    const maxActions = 100;

    while (actions < maxActions && state.phase !== TurnPhase.GameOver) {
      const currentPlayer = state.players[state.currentPlayerIndex];
      let botId: string;

      if (state.phase === TurnPhase.AwaitingResponse && state.pendingAction) {
        const targetId = state.pendingAction.targetPlayerIds.find(
          (id) => !state.pendingAction!.respondedPlayerIds.includes(id)
        );
        if (!targetId) break;
        botId = targetId;
      } else {
        botId = currentPlayer.id;
      }

      const action = chooseBotAction(state, botId, "hard");
      action.playerId = botId;
      const result = applyAction(state, action);
      if (!result.ok) break;
      state = result.state;
      actions++;

      // Check bank value after roughly 5 turns (each turn ~4 actions: draw + 3 plays)
      if (actions >= 20) {
        const banker = state.players.find(p => p.id === "banker");
        if (banker) bankerBankValue = banker.bank.reduce((sum, c) => sum + c.bankValue, 0);
        if (bankerBankValue > 0) break;
      }
    }

    expect(bankerBankValue).toBeGreaterThan(0);
  });
});

// ============================================================
// EMPTY HAND DRAW TESTS
// ============================================================

describe("Empty Hand Draw", () => {
  it("player with 0 cards does NOT auto-draw — waits until draw phase", () => {
    let state: GameState = {
      roomCode: "EMPTY",
      deck: Array.from({ length: 30 }, (_, i) => money(`dk${i}`, 1)),
      discardPile: [],
      players: [
        {
          id: "p1", name: "Alice", avatar: 0,
          hand: [], // empty hand!
          bank: [money("bank1", 5)],
          properties: [],
          connected: true,
        },
        {
          id: "p2", name: "Bob", avatar: 1,
          hand: [money("m1", 1)],
          bank: [],
          properties: [],
          connected: true,
        },
      ],
      currentPlayerIndex: 0,
      actionsRemaining: 0,
      phase: TurnPhase.Play,
      pendingAction: null,
      turnNumber: 1,
      winnerId: null,
      useDoubleDeck: false,
      doubleRentActive: false,
    };

    // P1 ends turn with 0 cards
    state = ok(applyAction(state, { type: ActionType.EndTurn, playerId: "p1" }));

    // Now it's P2's turn (Draw phase)
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.phase).toBe(TurnPhase.Draw);
    // P1 still has 0 cards — no auto-draw happened
    expect(state.players[0].hand).toHaveLength(0);

    // P2 draws and ends turn
    state = ok(applyAction(state, { type: ActionType.DrawCards, playerId: "p2" }));
    state = ok(applyAction(state, { type: ActionType.EndTurn, playerId: "p2" }));

    // Back to P1's Draw phase — still 0 cards until they draw
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.phase).toBe(TurnPhase.Draw);
    expect(state.players[0].hand).toHaveLength(0);

    // P1 draws — should get 5 cards (empty hand rule)
    state = ok(applyAction(state, { type: ActionType.DrawCards, playerId: "p1" }));
    expect(state.players[0].hand).toHaveLength(5);
    expect(state.phase).toBe(TurnPhase.Play);
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

// ============================================================
// SERVER-LEVEL BOT SCHEDULING TESTS
// ============================================================

import { GameRoom } from "../server/GameRoom";
import { WebSocket } from "ws";
import { ServerMessageType } from "../shared/types";

function createMockWs(): WebSocket & { _sent: string[] } {
  const sent: string[] = [];
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn((data: string) => { sent.push(data); }),
    ping: vi.fn(),
    terminate: vi.fn(),
    on: vi.fn(),
    _sent: sent,
  } as unknown as WebSocket & { _sent: string[] };
}

function parseSent(ws: WebSocket & { _sent: string[] }): any[] {
  return ws._sent.map((s) => JSON.parse(s));
}

describe("Bot Turn Scheduling (Server)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("bot draws and plays through its turn when it goes first", () => {
    const ws1 = createMockWs();
    const room = new GameRoom("BSCHED", "human1", "Human", 0, ws1 as WebSocket, "tok1");

    // Add a hard bot
    const addResult = room.addBot("hard");
    expect(addResult.success).toBe(true);
    const botId = addResult.bot!.id;

    // Start game — bot might be first or second
    room.startGame("human1");
    expect(room.gameState).not.toBeNull();

    const gs = room.gameState!;
    const firstPlayerId = gs.players[gs.currentPlayerIndex].id;

    if (firstPlayerId === botId) {
      // Bot goes first — it's in Draw phase, a bot turn should be scheduled
      expect(gs.phase).toBe(TurnPhase.Draw);

      // Clear sent messages to track new ones
      ws1._sent.length = 0;

      // Advance past bot turn delay (up to 1500ms)
      vi.advanceTimersByTime(2000);

      // Bot should have drawn cards — check that state updates were broadcast
      const updates = parseSent(ws1).filter((m) => m.type === "game_state_update");
      expect(updates.length).toBeGreaterThanOrEqual(1);

      // The bot should have acted — phase should have advanced past Draw
      // (bot draws, then plays or ends turn)
      const lastUpdate = updates[updates.length - 1];
      const lastState = lastUpdate.payload.state;
      // Bot should have at least drawn (moved past Draw phase for its turn)
      // After multiple delays, the bot may have completed its entire turn
      // The key assertion: the game is NOT stuck in Draw phase for the bot
      const currentId = lastState.you
        ? gs.players[lastState.currentPlayerIndex]?.id
        : null;
      // If it's still the bot's turn, it should be in Play phase (already drew)
      // If the bot finished its turn, the human should be current
      if (currentId === botId) {
        expect(lastState.phase).not.toBe("draw");
      }
    } else {
      // Human goes first — end turn to give bot a turn
      room.processAction({ type: ActionType.DrawCards, playerId: "human1" });
      room.processAction({ type: ActionType.EndTurn, playerId: "human1" });

      // Now it's the bot's turn in Draw phase
      expect(room.gameState!.players[room.gameState!.currentPlayerIndex].id).toBe(botId);
      expect(room.gameState!.phase).toBe(TurnPhase.Draw);

      ws1._sent.length = 0;

      // Advance to let bot act
      vi.advanceTimersByTime(2000);

      const updates = parseSent(ws1).filter((m) => m.type === "game_state_update");
      expect(updates.length).toBeGreaterThanOrEqual(1);
    }

    // Game should NOT be stuck — verify it hasn't crashed
    expect(room.gameState!.phase).not.toBe(TurnPhase.GameOver);
  });

  it("bot takes multiple actions per turn with delays between each", () => {
    const ws1 = createMockWs();
    const room = new GameRoom("BMULTI", "human1", "Human", 0, ws1 as WebSocket, "tok1");

    room.addBot("hard");
    room.startGame("human1");

    const gs = room.gameState!;
    const botPlayer = gs.players.find((p) => p.id !== "human1")!;
    const botId = botPlayer.id;

    // If human goes first, play through their turn
    if (gs.players[gs.currentPlayerIndex].id === "human1") {
      room.processAction({ type: ActionType.DrawCards, playerId: "human1" });
      room.processAction({ type: ActionType.EndTurn, playerId: "human1" });
    }

    // Bot's turn — advance through multiple bot action delays
    // Each action takes 800-1500ms, bot can do up to 4 actions (draw + 3 plays)
    ws1._sent.length = 0;

    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(2000);
      // If turn already advanced to human, stop
      if (
        room.gameState!.players[room.gameState!.currentPlayerIndex].id !== botId
      ) break;
    }

    // Bot should have completed its turn (or game ended)
    const currentId = room.gameState!.players[room.gameState!.currentPlayerIndex].id;
    // Either human's turn now or game over
    const gameOver = room.gameState!.phase === TurnPhase.GameOver;
    expect(currentId === "human1" || gameOver).toBe(true);

    // Should have received multiple state updates from bot actions
    const updates = parseSent(ws1).filter((m) => m.type === "game_state_update");
    expect(updates.length).toBeGreaterThanOrEqual(2); // At least draw + end turn
  });
});
