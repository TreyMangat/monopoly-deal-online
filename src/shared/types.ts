// ============================================================
// MONOPOLY DEAL ONLINE — Core Type Definitions
// ============================================================
// Every card, every state, every action is typed here.
// The game engine, server, and (eventually) iOS client
// all derive from these types.
// ============================================================

// ---- Card Color Groups ----

export enum PropertyColor {
  Brown = "brown",
  LightBlue = "light_blue",
  Pink = "pink",
  Orange = "orange",
  Red = "red",
  Yellow = "yellow",
  Green = "green",
  DarkBlue = "dark_blue",
  Railroad = "railroad",
  Utility = "utility",
}

// ---- Card Types ----

export enum CardType {
  Property = "property",
  PropertyWild = "property_wild",
  PropertyWildAll = "property_wild_all", // the 2 rainbow wildcards
  Money = "money",
  ActionPassGo = "action_pass_go",
  ActionDebtCollector = "action_debt_collector",
  ActionItsMyBirthday = "action_its_my_birthday",
  ActionForcedDeal = "action_forced_deal",
  ActionSlyDeal = "action_sly_deal",
  ActionDealBreaker = "action_deal_breaker",
  ActionJustSayNo = "action_just_say_no",
  ActionDoubleRent = "action_double_rent",
  ActionHouse = "action_house",
  ActionHotel = "action_hotel",
  RentWild = "rent_wild", // 3 rainbow rent cards — charge any color
  RentTwoColor = "rent_two_color", // standard 2-color rent cards
}

// ---- Card Definition ----
// Every card in the 110-card deck is one of these.

export interface Card {
  id: string; // unique identifier e.g. "prop_brown_1"
  type: CardType;
  name: string; // display name e.g. "Mediterranean Avenue"
  bankValue: number; // money value if banked (all cards have one)

  // Property-specific
  color?: PropertyColor; // primary color (for property cards)
  altColor?: PropertyColor; // second color (for 2-color wildcards)
  rentTier?: number[]; // rent values by set completion [1-card, 2-card, ...]

  // Rent card specific
  rentColors?: [PropertyColor, PropertyColor]; // which colors this rent card applies to

  // Action specific
  actionValue?: number; // e.g. debt collector = 5M, birthday = 2M
}

// ---- Player State ----

export interface PlayerState {
  id: string; // UUID
  name: string;
  avatar: number; // avatar index (0-5)
  hand: Card[]; // private — only visible to this player
  bank: Card[]; // face-up money pile
  properties: PropertyGroup[]; // organized by color group
  connected: boolean; // WebSocket connection status
}

export interface PropertyGroup {
  color: PropertyColor;
  cards: Card[]; // property + wild cards in this group
  hasHouse: boolean;
  hasHotel: boolean;
}

// ---- Turn Phases ----

export enum TurnPhase {
  WaitingToStart = "waiting_to_start",
  Draw = "draw",
  Play = "play",
  AwaitingResponse = "awaiting_response", // someone must respond (pay rent, etc.)
  Discard = "discard",
  GameOver = "game_over",
}

// ---- Pending Action (when a player must respond) ----

export enum PendingActionType {
  PayRent = "pay_rent",
  PayDebtCollector = "pay_debt_collector",
  PayBirthday = "pay_birthday",
  RespondToSlyDeal = "respond_to_sly_deal",
  RespondToForcedDeal = "respond_to_forced_deal",
  RespondToDealBreaker = "respond_to_deal_breaker",
  CounterJustSayNo = "counter_just_say_no",
}

export interface PendingAction {
  type: PendingActionType;
  fromPlayerId: string; // who initiated
  targetPlayerIds: string[]; // who must respond (1 for targeted, all for birthday/rent-all)
  respondedPlayerIds: string[]; // who has already responded
  amount?: number; // how much is owed (for payment actions)
  cardId?: string; // the action card that was played
  targetCardId?: string; // for sly deal: which card is being stolen
  offeredCardId?: string; // for forced deal: what's being offered
  requestedCardId?: string; // for forced deal: what's being requested
  isDoubled?: boolean; // was Double Rent played on this?
  justSayNoChain?: JustSayNoLink[]; // tracks the JSN counter chain
}

export interface JustSayNoLink {
  playerId: string;
  action: "just_say_no" | "accept";
}

// ---- Full Game State ----

export interface GameState {
  roomCode: string;
  deck: Card[]; // draw pile (face down)
  discardPile: Card[]; // center discard
  players: PlayerState[];
  currentPlayerIndex: number;
  actionsRemaining: number; // 0-3 per turn
  phase: TurnPhase;
  pendingAction: PendingAction | null;
  turnNumber: number;
  winnerId: string | null;
  useDoubleDeck: boolean; // true for 6 players
  doubleRentActive: boolean; // set by Double Rent card, consumed by next rent play
}

// ---- Player Actions (client → server) ----

export enum ActionType {
  // Turn actions (cost 1 of 3 plays)
  PlayPropertyCard = "play_property_card",
  PlayMoneyToBank = "play_money_to_bank",
  PlayActionToBank = "play_action_to_bank", // use action card as money
  PlayPassGo = "play_pass_go",
  PlayRentCard = "play_rent_card",
  PlayDebtCollector = "play_debt_collector",
  PlayBirthday = "play_birthday",
  PlaySlyDeal = "play_sly_deal",
  PlayForcedDeal = "play_forced_deal",
  PlayDealBreaker = "play_deal_breaker",
  PlayHouse = "play_house",
  PlayHotel = "play_hotel",
  PlayDoubleRent = "play_double_rent",

  // Response actions (don't cost a play)
  PayWithCards = "pay_with_cards", // choose cards to pay a debt
  PlayJustSayNo = "play_just_say_no",
  AcceptAction = "accept_action", // accept a steal/deal/breaker

  // Turn management
  EndTurn = "end_turn",
  DiscardCards = "discard_cards",

  // Wild card management
  MoveWildCard = "move_wild_card", // flip a wild to its other color
}

export interface PlayerAction {
  type: ActionType;
  playerId: string;

  // Which card(s) are involved
  cardId?: string; // the card being played
  cardIds?: string[]; // multiple cards (for payment, discard)

  // Targeting
  targetPlayerId?: string; // who is being targeted
  targetCardId?: string; // which of their cards (sly deal, forced deal)
  targetColor?: PropertyColor; // which color group to charge rent for

  // Placement
  destinationColor?: PropertyColor; // where to place a wild/property

  // Forced deal specifics
  offeredCardId?: string; // card you're giving in a forced deal
  requestedCardId?: string; // card you want in a forced deal
}

// ---- Server → Client Messages ----

export enum ServerMessageType {
  RoomCreated = "room_created",
  PlayerJoined = "player_joined",
  PlayerLeft = "player_left",
  PlayerReconnected = "player_reconnected",
  GameStarted = "game_started",
  GameStateUpdate = "game_state_update",
  ActionRejected = "action_rejected",
  ActionResolved = "action_resolved",
  GameOver = "game_over",
  Error = "error",
  Ping = "ping",
}

export interface ServerMessage {
  type: ServerMessageType;
  payload: any; // typed per message type below
}

// Filtered state sent to each player (hides opponents' hands)
export interface ClientGameState {
  roomCode: string;
  phase: TurnPhase;
  currentPlayerIndex: number;
  actionsRemaining: number;
  turnNumber: number;
  drawPileCount: number;
  discardPileTop: Card | null;
  you: PlayerState; // full hand visible
  opponents: OpponentView[]; // hands hidden
  pendingAction: PendingAction | null;
  winnerId: string | null;
}

export interface OpponentView {
  id: string;
  name: string;
  avatar: number;
  handCount: number; // only show count, not actual cards
  bank: Card[];
  properties: PropertyGroup[];
  connected: boolean;
}

// ---- Client → Server Messages ----

export enum ClientMessageType {
  CreateRoom = "create_room",
  JoinRoom = "join_room",
  StartGame = "start_game",
  PlayerAction = "player_action",
  Pong = "pong",
}

export interface ClientMessage {
  type: ClientMessageType;
  payload: any;
}

// ---- Room / Lobby Types ----

export enum RoomStatus {
  Waiting = "waiting",
  Playing = "playing",
  Finished = "finished",
}

export interface RoomInfo {
  code: string;
  status: RoomStatus;
  players: { id: string; name: string; avatar: number }[];
  hostId: string;
  maxPlayers: number;
  createdAt: number;
}
