export type HandlerResult = unknown | Promise<unknown>;
export type CommandScope = 'all' | 'private' | 'groups';
export type ButtonStyle = 'primary' | 'success' | 'danger';
export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiResponse<T = unknown> {
  /** HTTP response status. */
  status: number;
  /** True when the status is in the 200-299 range. */
  ok: boolean;
  /** Parsed response body, response text, or an error object. */
  data: T;
  /** Request duration in milliseconds. */
  ms: number;
}

export interface Button {
  /** Button label shown to the user. */
  text: string;
  /** Callback data received by `bot.callback()`. */
  data?: string;
  /** URL opened when the button is pressed. */
  url?: string;
  /** Opens the bot's mini app. */
  app?: string;
  /** Text copied to the clipboard. */
  copy?: string;
  /** Bot command to run. */
  command?: string;
  /** Yurba button style. */
  style?: ButtonStyle;
}

export type ButtonRow = Button[];

export interface YurbaInlineButton {
  Text: string;
  Data?: string;
  Url?: string;
  App?: string;
  Copy?: string;
  Command?: string;
  Style?: ButtonStyle;
}

export class ButtonsBuilder {
  /** Start a new row. All following buttons are added to it. */
  row(): this;
  /** Add a callback button. */
  callback(text: string, data: string): this;
  /** Alias for `callback()`. */
  btn(text: string, data: string): this;
  /** Add a URL button. */
  link(text: string, url: string): this;
  /** Add a button that opens the bot's mini app. */
  app(text: string, value?: string): this;
  /** Add a command button. */
  command(text: string, command: string): this;
  /** Alias for `command()`. */
  cmd(text: string, command: string): this;
  /** Add a copy-to-clipboard button. */
  copy(text: string, value: string): this;
  /** Add a button object to the current row. */
  add(button: Button): this;
  /** Set the style on the most recently added button. */
  style(style: ButtonStyle): this;
  /** Set the most recently added button to Yurba's default style. */
  gray(): this;
  /** Set the most recently added button to primary style. */
  primary(): this;
  /** Set the most recently added button to success style. */
  success(): this;
  /** Set the most recently added button to danger style. */
  danger(): this;
  /** Build button rows for `ctx.reply()` and `ctx.send()`. */
  build(): ButtonRow[];
  /** Build Yurba's raw `{ Inline: [...] }` markup shape. */
  buildMarkup(): { Inline: YurbaInlineButton[][] };
}

export interface ReplyOptions {
  /** Inline button rows. */
  buttons?: ButtonRow[];
  /** One-time reply keyboard rows. */
  keyboard?: string[][];
  /** Hint shown in the message input while the reply keyboard is active. */
  placeholder?: string;
  /** Remove the current reply keyboard. */
  removeKeyboard?: boolean;
  /** Message ID to quote in `MessageContext.reply()`. Use `null` to disable quoting. */
  replyTo?: string | null;
}

export interface CommandOptions {
  /** Set false to keep this command local instead of registering it with Yurba. */
  register?: boolean;
}

export interface CommandDefinition {
  /** Command name without the leading slash. */
  name: string;
  /** Description displayed in the generated help text and Yurba command list. */
  description?: string;
  /** Where Yurba exposes the command. */
  scope?: CommandScope;
  /** Whether to register the command with Yurba. Defaults to true. */
  register?: boolean;
  /** Command handler. */
  run: (context: MessageContext) => HandlerResult;
}

export interface YurbaUser {
  ID?: number | string;
  Name?: string;
  Link?: string;
  [key: string]: unknown;
}

export interface YurbaDialog {
  ID?: string;
  [key: string]: unknown;
}

export interface YurbaMessage {
  ID?: string;
  Text?: string;
  Author?: YurbaUser;
  Dialog?: YurbaDialog;
  [key: string]: unknown;
}

export interface RawUpdate {
  ID?: number;
  Type?: string;
  Args?: string;
  Payload?: string;
  Message?: YurbaMessage;
  Callback?: YurbaCallback;
  Inline?: { ID?: string; Query?: string; Text?: string };
  User?: YurbaUser;
  Dialog?: YurbaDialog;
  [key: string]: unknown;
}

export interface YurbaCallback {
  ID: string;
  Data?: string;
  Message?: YurbaMessage;
  User?: YurbaUser;
  [key: string]: unknown;
}

export interface MessageContext {
  /** Raw Yurba update object. */
  update: RawUpdate;
  /** Full message from the update. */
  message: YurbaMessage;
  /** Message author, when available. */
  user: YurbaUser | null;
  /** Dialog ID, when available. */
  dialog: string | null;
  /** Text arguments after the command name. */
  args: string;
  /** Deep-link payload from `/start <payload>`. */
  payload: string;
  /** Reply to the current message. */
  reply(text: string, options?: ReplyOptions): Promise<ApiResponse>;
  /** Send a message without quoting the current message. */
  send(text: string, options?: ReplyOptions): Promise<ApiResponse>;
  /** Send a typing indicator to this dialog. */
  typing(): Promise<ApiResponse>;
  /** Build help text from registered commands. */
  help(): string;
}

export interface CallbackAnswerOptions {
  /** Brief text displayed after acknowledging the callback. */
  text?: string;
  /** Display the text as an alert dialog. */
  alert?: boolean;
  /** URL opened by the callback response. */
  url?: string;
}

export interface CallbackContext {
  /** Raw Yurba update object. */
  update: RawUpdate;
  /** Callback query data. */
  callback: YurbaCallback;
  /** User who pressed the button, when available. */
  user: YurbaUser | null;
  /** Dialog ID, when available. */
  dialog: string | null;
  /** Original message containing the button, if available. */
  message: YurbaMessage | null;
  /** Data attached to the pressed button. */
  data: string;
  /** Acknowledge the button press. Call this before doing longer work. */
  answer(textOrOptions?: string | CallbackAnswerOptions): Promise<ApiResponse | undefined>;
  /** Edit the original message. */
  replace(text: string, options?: ReplyOptions): Promise<ApiResponse>;
  /** Update or remove the original message's buttons. */
  editMarkup(options?: ReplyOptions): Promise<ApiResponse>;
  /** Send a separate message in the dialog. */
  reply(text: string, options?: ReplyOptions): Promise<ApiResponse>;
}

export interface InlineResult {
  id?: string;
  ID?: string;
  title?: string;
  Title?: string;
  text?: string;
  Text?: string;
}

export interface InlineContext {
  /** Raw Yurba update object. */
  update: RawUpdate;
  /** User who sent the inline query, when available. */
  user: YurbaUser | null;
  /** Text entered after the bot mention. */
  query: string;
  /** Send results for this inline query. */
  answer(results?: InlineResult[]): Promise<ApiResponse>;
}

export interface BotInfo {
  data: YurbaUser | null;
  name: string | null;
  link: string | null;
  id: number | null;
  /** Build a Yurba URL that opens this bot. */
  invite(payload?: string): string;
}

export interface Bot {
  /** Bot profile data, populated after `start()` completes boot. */
  readonly me: BotInfo;
  /** Register a command with a handler as the second argument. */
  command(name: string, handler: (context: MessageContext) => HandlerResult): this;
  /** Register a command and its Yurba-visible description. */
  command(
    name: string,
    description: string,
    handler: (context: MessageContext) => HandlerResult,
    options?: CommandOptions,
  ): this;
  /** Register a command using the full object form. */
  command(definition: CommandDefinition): this;
  /** Handle callback data by exact match or colon-separated prefix. */
  callback(pattern: string, handler: (context: CallbackContext) => HandlerResult): this;
  /** Subscribe to incoming messages. */
  on(event: 'message', handler: (context: MessageContext) => HandlerResult): this;
  /** Subscribe to inline queries. */
  on(event: 'inline', handler: (context: InlineContext) => HandlerResult): this;
  /** Subscribe to other Yurba events; these handlers receive the raw update. */
  on(event: string, handler: (update: RawUpdate) => HandlerResult): this;
  /** Start the bot and its configured transport. Resolves only after shutdown. */
  start(): Promise<never>;
}

export declare const bot: Bot;

export declare function api(
  method: ApiMethod,
  path: string,
  body?: object,
  options?: { timeout?: number },
): Promise<ApiResponse>;

export interface Logger {
  debug(tag: string, message: string, data?: unknown): void;
  info(tag: string, message: string, data?: unknown): void;
  warn(tag: string, message: string, data?: unknown): void;
  error(tag: string, message: string, data?: unknown): void;
}

export declare const L: Logger;

export declare function fmtUptime(): string;

export declare const stats: {
  updates: number;
  errors: number;
  apiCalls: number;
  apiErrors: number;
  dupes: number;
};