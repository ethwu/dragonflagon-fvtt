
import CONFIG from '../CONFIG.js';
import DFAdventureLogConfig from './DFAdventureLogConfig.js';


declare interface ChatCommand {
	commandKey: String;
	shouldDisplayToChat: Boolean;
	invokeOnCommand: Function;
	createdMessageType: Number;
	iconClass: String;
	description: String;
	gmOnly: Boolean;
}

declare class ChatCommands {
	/**
	 * Registers a Chat Command to be handled
	 */
	registerCommand(command: ChatCommand): void;
	/**
	 * Deregister a Chat Command
	 */
	deregisterCommand(command: ChatCommand): void;
	createCommandFromData(data: any): ChatCommand;
}

declare class GameExt extends Game {
	chatCommands: ChatCommands
}

export default class DFAdventureLogProcessor {
	static readonly PREF_ENABLE = 'enable-command';
	static readonly PREF_GMONLY = 'df-log-gmonly';
	static readonly PREF_GMONLY_WHISPER = 'df-log-gmonly-whisper';
	static readonly PREF_MESSAGES = 'df-log-messages';
	static command: ChatCommand = null;
	static setupSettings() {

		game.settings.register(CONFIG.MOD_NAME, DFAdventureLogProcessor.PREF_ENABLE, {
			scope: 'world',
			name: 'DF_CHAT_LOG.Setting_EnableTitle',
			hint: 'DF_CHAT_LOG.Setting_EnableHint',
			config: true,
			type: Boolean,
			default: true,
			onChange: (enabled: Boolean) => {
				if (!enabled && !!DFAdventureLogProcessor.command)
					DFAdventureLogProcessor.deregisterCommand();
				else
					DFAdventureLogProcessor.registerCommand();
			}
		});
		game.settings.register(CONFIG.MOD_NAME, DFAdventureLogProcessor.PREF_GMONLY, {
			name: 'DF_CHAT_LOG.Setting_GmOnlyTitle',
			hint: 'DF_CHAT_LOG.Setting_GmOnlyHint',
			scope: 'world',
			type: Boolean,
			default: false,
			config: true,
			onChange: (gmOnly) => {
				if (gmOnly && !game.user.isGM)
					DFAdventureLogProcessor.deregisterCommand();
				else
					DFAdventureLogProcessor.registerCommand();
			}
		});
		game.settings.register(CONFIG.MOD_NAME, DFAdventureLogProcessor.PREF_GMONLY_WHISPER, {
			name: 'DF_CHAT_LOG.Setting_GmOnlyWhisperName',
			hint: 'DF_CHAT_LOG.Setting_GmOnlyWhisperHint',
			scope: 'world',
			type: Boolean,
			default: false,
			config: true
		});

		game.settings.register(CONFIG.MOD_NAME, DFAdventureLogProcessor.PREF_MESSAGES, {
			name: 'DF_CHAT_LOG.Setting_PrintMessagesName',
			hint: 'DF_CHAT_LOG.Setting_PrintMessagesHint',
			scope: 'world',
			type: Boolean,
			default: true,
			config: true
		});

		Hooks.on('closeDFAdventureLogConfig', () => { DFAdventureLogProcessor.logConfig = null; });
		if (!!(game as GameExt).chatCommands)
			DFAdventureLogProcessor.registerCommand();
		else
			Hooks.on('chatCommandsReady', function (chatCommands: ChatCommands) {
				DFAdventureLogProcessor.registerCommand();
			});
	}

	static deregisterCommand() {
		(game as GameExt).chatCommands.deregisterCommand(DFAdventureLogProcessor.command);
		DFAdventureLogProcessor.command = null;
	}
	static registerCommand() {
		if (!game.settings.get(CONFIG.MOD_NAME, DFAdventureLogProcessor.PREF_ENABLE))
			return;
		if (game.settings.get(CONFIG.MOD_NAME, DFAdventureLogProcessor.PREF_GMONLY) && !game.user.isGM)
			return;
		if (!!DFAdventureLogProcessor.command)
			return;
		DFAdventureLogProcessor.command = (game as GameExt).chatCommands.createCommandFromData({
			commandKey: "/log",
			invokeOnCommand: DFAdventureLogProcessor.chatCommandProcessor,
			shouldDisplayToChat: false,
			iconClass: "fa-edit",
			description: game.i18n.localize("DF_CHAT_LOG.CommandDescription")
		});
		(game as GameExt).chatCommands.registerCommand(DFAdventureLogProcessor.command);
	}

	private static logConfig: DFAdventureLogConfig = null;
	private static async chatCommandProcessor(chatLog: ChatLog, messageText: string, chatData: ChatMessage.ChatData): Promise<void> {
		const speakerId = chatData.user;
		messageText = messageText.trim();
		const tokens = messageText.split(' ');

		if (!game.settings.get(CONFIG.MOD_NAME, DFAdventureLogProcessor.PREF_ENABLE)) {
			(game as GameExt).chatCommands.deregisterCommand(DFAdventureLogProcessor.command);
			ui.notifications.warn(game.i18n.localize('DF_CHAT_LOG.Error_Disabled'));
			return;
		}

		// If the user did not enter anything, send them a help message
		if (messageText.length == 0 || tokens.every(x => x.length == 0)) {
			setTimeout(async () => {
				await Dialog.prompt({
					title: game.i18n.localize('DF_CHAT_LOG.HelpDialog_Title'),
					label: 'OK',
					callback: () => { },
					content: await renderTemplate(`modules/df-chat-enhance/templates/lang/log-help.${game.i18n.localize('DF_CHAT_ENHANCE.LANG')}.hbs`, {
						isGM: game.user.isGM
					}),
					options: { width: 800 }
				});
			}, 1);
			return;
		}

		const speaker = ChatMessage.getSpeaker({ user: game.user } as any);
		const messageData: {
			flavor: string,
			user: string,
			speaker: ChatMessage.SpeakerData,
			type: number,
			content: string,
			whisper?: string[]
		} = {
			flavor: '',
			user: game.user._id,
			speaker: speaker,
			type: CONST.CHAT_MESSAGE_TYPES.OOC,
			content: '',
		};
		switch (tokens[0].toLowerCase()) {
			case 'config':
				if (!game.user.isGM) {
					ui.notifications.warn(game.i18n.localize('DF_CHAT_LOG.Error_ConfigGmOnly'));
					return;
				}
				setTimeout(async () => {
					if (!!DFAdventureLogProcessor.logConfig)
						DFAdventureLogProcessor.logConfig.bringToTop();
					else {
						DFAdventureLogProcessor.logConfig = new DFAdventureLogConfig();
						DFAdventureLogProcessor.logConfig.render(true);
					}
				}, 1);
				return;
			case 'q':
			case 'quote':
				messageText = messageText.replace(tokens[0], '').trimStart();
				var source: string;
				// If the token starts with a quote, but does not end with one
				if (tokens[1][0] === '"' && tokens[1][tokens[1].length - 1] !== '"') {
					// Extract the quoted Source
					var index = -1;
					for (let c = 1; c < messageText.length; c++) {
						if (messageText[c] === '"') {
							index = c;
							break;
						}
					}
					if (index < 0) {
						ui.notifications.error(game.i18n.localize('DF_CHAT_LOG.Error_MissingQuote').replace('{0}', tokens[1]));
						setTimeout(() => $('#chat-message').val('/log q ' + messageText), 1);
						return;
					}
					source = messageText.slice(0, index + 1);
				}
				else
					source = tokens[1];
				messageText = messageText.replace(source, '').trim();
				// Remove any double-quotes surrounding the source token
				source = source.replace(/"/gm, '');
				messageData.flavor = `${game.user.name} quoted ${source}`;
				messageData.content = `<span class="dfal-qu">${messageText}</span>`;
				if (messageText.length == 0) {
					ui.notifications.error(game.i18n.localize('DF_CHAT_LOG.Error_MissingMessage'));
					setTimeout(() => $('#chat-message').val(`/log q "${source}" ${messageText}`), 1);
					return;
				}
				var line = game.i18n.localize('DF_CHAT_LOG.Log_Quote');
				line = line.replace('{0}', new Date().toLocaleString('sv').replace(',', '').replace(/ ([AP])/, '$1'));
				line = line.replace('{1}', game.user.name);
				line = line.replace('{2}', source);
				messageText = line.replace('{3}', messageText);
				break;
			case 'e':
			case 'event':
				messageText = messageText.replace(tokens[0], '').trim();
			default:
				messageText = messageText.trim();
				messageData.flavor = 'Event Logged';
				messageData.content = `<span class="dfal-ev">${messageText}</span>`;
				var line = game.i18n.localize('DF_CHAT_LOG.Log_Event');
				line = line.replace('{0}', new Date().toLocaleString('sv').replace(',', '').replace(/ ([AP])/, '$1'));
				line = line.replace('{1}', game.user.name);
				messageText = line.replace('{2}', messageText);
				break;
		}

		const journalId = game.settings.get(CONFIG.MOD_NAME, DFAdventureLogConfig.PREF_JOURNAL) as string;
		if (!game.journal.has(journalId)) {
			if (game.user.isGM)
				ui.notifications.error(game.i18n.localize('DF_CHAT_LOG.Error_NoJournalSetGM'), { permanent: true });
			else
				ui.notifications.warn(game.i18n.localize('DF_CHAT_LOG.Error_NoJournalSet'));
			return;
		}
		const journal = game.journal.get(journalId);
		var html = $(journal.data.content);
		var messageHtml = $(messageText);
		var article = html.find('article.df-adventure-log');
		if (article.length == 0) {
			await DFAdventureLogConfig.initializeJournal(false);
			html = $(journal.data.content);
			messageHtml = $(messageText);
			article = html.find('article.df-adventure-log');
		}
		article.append(messageHtml);
		await journal.update({
			content: $('<div></div>').append(html).html()
		});
		const rollType = game.settings.get("core", "rollMode");
		if (game.user.isGM) {
			if (
				// If the roll type is anything but Public
				rollType !== 'roll'
				// If logs are GM Only and the Whisper All settings is true
				|| (game.settings.get(CONFIG.MOD_NAME, DFAdventureLogProcessor.PREF_GMONLY) &&
					game.settings.get(CONFIG.MOD_NAME, DFAdventureLogProcessor.PREF_GMONLY_WHISPER))
			) {
				// Make the message a whisper
				messageData.whisper = [game.user.id];
			}
		}
		if (game.settings.get(CONFIG.MOD_NAME, DFAdventureLogProcessor.PREF_MESSAGES))
			await ChatMessage.create(messageData as any, {});
	}
}