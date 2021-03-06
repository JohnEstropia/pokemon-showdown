/*
 * Hangman chat plugin
 * By bumbadadabum and Zarel. Art by crobat.
 */

import {Utils} from '../../lib/utils';
import {FS} from '../../lib/fs';

const HANGMAN_FILE = 'config/chat-plugins/hangman.json';

const DIACRITICS_AFTER_UNDERSCORE = /_[\u0300-\u036f\u0483-\u0489\u0610-\u0615\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06ED\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]+/g;

export let hangmanData: {[roomid: string]: {[phrase: string]: string[]}} = {};

try {
	hangmanData = JSON.parse(FS(HANGMAN_FILE).readSync());
} catch (e) {}

const maxMistakes = 6;

export class Hangman extends Rooms.RoomGame {
	gameNumber: number;
	creator: ID;
	word: string;
	hint: string;
	incorrectGuesses: number;

	guesses: string[];
	letterGuesses: string[];
	lastGuesser: string;
	wordSoFar: string[];
	readonly checkChat = true;

	constructor(room: Room, user: User, word: string, hint = '') {
		super(room);

		this.gameNumber = room.nextGameNumber();

		this.gameid = 'hangman' as ID;
		this.title = 'Hangman';
		this.creator = user.id;
		this.word = word;
		this.hint = hint;
		this.incorrectGuesses = 0;

		this.guesses = [];
		this.letterGuesses = [];
		this.lastGuesser = '';
		this.wordSoFar = [];

		for (const letter of word) {
			if (/[a-zA-Z]/.test(letter)) {
				this.wordSoFar.push('_');
			} else {
				this.wordSoFar.push(letter);
			}
		}
	}

	choose(user: User, word: string) {
		if (user.id === this.creator) throw new Chat.ErrorMessage("You can't guess in your own hangman game.");

		const sanitized = word.replace(/[^A-Za-z ]/g, '');
		const normalized = toID(sanitized);
		if (normalized.length < 1) {
			throw new Chat.ErrorMessage(`Use "/guess [letter]" to guess a letter, or "/guess [phrase]" to guess the entire Hangman phrase.`);
		}
		if (sanitized.length > 30) throw new Chat.ErrorMessage(`Guesses must be 30 or fewer letters – "${word}" is too long.`);

		for (const guessid of this.guesses) {
			if (normalized === toID(guessid)) throw new Chat.ErrorMessage(`Your guess "${word}" has already been guessed.`);
		}

		if (sanitized.length > 1) {
			if (!this.guessWord(sanitized, user.name)) {
				throw new Chat.ErrorMessage(`Your guess "${sanitized}" is invalid.`);
			} else {
				this.room.send(`${user.name} guessed "${sanitized}"!`);
			}
		} else {
			if (!this.guessLetter(sanitized, user.name)) {
				throw new Chat.ErrorMessage(`Your guess "${sanitized}" is not a valid letter.`);
			}
		}
	}

	guessLetter(letter: string, guesser: string) {
		letter = letter.toUpperCase();
		if (this.guesses.includes(letter)) return false;
		if (this.word.toUpperCase().includes(letter)) {
			for (let i = 0; i < this.word.length; i++) {
				if (this.word[i].toUpperCase() === letter) {
					this.wordSoFar[i] = this.word[i];
				}
			}

			if (!this.wordSoFar.includes('_')) {
				this.incorrectGuesses = -1;
				this.guesses.push(letter);
				this.letterGuesses.push(`${letter}1`);
				this.lastGuesser = guesser;
				this.finish();
				return true;
			}
			this.letterGuesses.push(`${letter}1`);
		} else {
			this.incorrectGuesses++;
			this.letterGuesses.push(`${letter}0`);
		}

		this.guesses.push(letter);
		this.lastGuesser = guesser;
		this.update();
		return true;
	}

	guessWord(word: string, guesser: string) {
		const ourWord = toID(this.word);
		const guessedWord = toID(word);
		if (ourWord === guessedWord) {
			for (const [i, letter] of this.wordSoFar.entries()) {
				if (letter === '_') {
					this.wordSoFar[i] = this.word[i];
				}
			}
			this.incorrectGuesses = -1;
			this.guesses.push(word);
			this.lastGuesser = guesser;
			this.finish();
			return true;
		} else if (ourWord.length === guessedWord.length) {
			this.incorrectGuesses++;
			this.guesses.push(word);
			this.lastGuesser = guesser;
			this.update();
			return true;
		}
		return false;
	}

	hangingMan() {
		return `<img width="120" height="120" src="//${Config.routes.client}/fx/hangman${this.incorrectGuesses === -1 ? 7 : this.incorrectGuesses}.png" />`;
	}

	generateWindow() {
		let result = 0;

		if (this.incorrectGuesses === maxMistakes) {
			result = 1;
		} else if (!this.wordSoFar.includes('_')) {
			result = 2;
		}

		const color = result === 1 ? 'red' : (result === 2 ? 'green' : 'blue');
		const message = `${result === 1 ? 'Too bad! The mon has been hanged.' : (result === 2 ? 'The word has been guessed. Congratulations!' : 'Hangman')}`;
		let output = `<div class="broadcast-${color}">`;
		output += `<p style="text-align:left;font-weight:bold;font-size:10pt;margin:5px 0 0 15px">${message}</p>`;
		output += `<table><tr><td style="text-align:center;">${this.hangingMan()}</td><td style="text-align:center;width:100%;word-wrap:break-word">`;

		let wordString = this.wordSoFar.join('');
		if (result === 1) {
			const word = this.word;
			wordString = wordString.replace(
				/_+/g,
				(match, offset) => `<font color="#7af87a">${word.substr(offset, match.length)}</font>`
			);
		}
		wordString = wordString.replace(DIACRITICS_AFTER_UNDERSCORE, '_');

		if (this.hint) output += Utils.html`<div>(Hint: ${this.hint})</div>`;
		output += `<p style="font-weight:bold;font-size:12pt;letter-spacing:3pt">${wordString}</p>`;
		if (this.guesses.length) {
			if (this.letterGuesses.length) {
				output += 'Letters: ' + this.letterGuesses.map(
					g => `<strong${g[1] === '1' ? '' : ' style="color: #DBA"'}>${Utils.escapeHTML(g[0])}</strong>`
				).join(', ');
			}
			if (result === 2) {
				output += Utils.html`<br />Winner: ${this.lastGuesser}`;
			} else if (this.guesses[this.guesses.length - 1].length === 1) {
				// last guess was a letter
				output += Utils.html` <small>&ndash; ${this.lastGuesser}</small>`;
			} else {
				output += Utils.html`<br />Guessed: ${this.guesses[this.guesses.length - 1]} ` +
					`<small>&ndash; ${this.lastGuesser}</small>`;
			}
		}

		output += '</td></tr></table></div>';

		return output;
	}

	display(user: User, broadcast = false) {
		if (broadcast) {
			this.room.add(`|uhtml|hangman${this.gameNumber}|${this.generateWindow()}`);
		} else {
			user.sendTo(this.room, `|uhtml|hangman${this.gameNumber}|${this.generateWindow()}`);
		}
	}

	update() {
		this.room.uhtmlchange(`hangman${this.gameNumber}`, this.generateWindow());

		if (this.incorrectGuesses === maxMistakes) {
			this.finish();
		}
	}

	end() {
		this.room.uhtmlchange(`hangman${this.gameNumber}`, '<div class="infobox">(The game of hangman was ended.)</div>');
		this.room.add("The game of hangman was ended.");
		this.room.game = null;
	}

	finish() {
		this.room.uhtmlchange(`hangman${this.gameNumber}`, '<div class="infobox">(The game of hangman has ended &ndash; scroll down to see the results)</div>');
		this.room.add(`|html|${this.generateWindow()}`);
		this.room.game = null;
	}
	static save() {
		FS(HANGMAN_FILE).writeUpdate(() => JSON.stringify(hangmanData));
	}
	static getRandom(room: RoomID) {
		if (!hangmanData[room]) {
			hangmanData[room] = {};
			this.save();
			throw new Chat.ErrorMessage(`The room ${room} has no saved hangman words.`);
		}
		const shuffled = Utils.randomElement(Object.keys(hangmanData[room]));
		const hints = hangmanData[room][shuffled];
		return {
			question: shuffled,
			hint: Utils.randomElement(hints),
		};
	}
	static validateParams(params: string[]) {
		// NFD splits diacritics apart from letters, allowing the letters to be guessed
		// underscore is used to signal "letter hasn't been guessed yet", so replace it with Japanese underscore as a workaround
		const phrase = params[0].normalize('NFD').trim().replace(/_/g, '\uFF3F');

		if (!phrase.length) throw new Chat.ErrorMessage("Enter a valid word");
		if (phrase.length > 30) throw new Chat.ErrorMessage("Phrase must be less than 30 characters long.");
		if (phrase.split(' ').some(w => w.length > 20)) {
			throw new Chat.ErrorMessage("Each word in the phrase must be less than 20 characters long.");
		}
		if (!/[a-zA-Z]/.test(phrase)) throw new Chat.ErrorMessage("Word must contain at least one letter.");
		let hint;
		if (params.length > 1) {
			hint = params.slice(1).join(',').trim();
			if (hint.length > 150) throw new Chat.ErrorMessage("Hint too long.");
		}
		return {phrase, hint};
	}
}

export const commands: ChatCommands = {
	hangman: {
		create: 'new',
		new(target, room, user, connection) {
			room = this.requireRoom();
			const text = this.filter(target);
			if (target !== text) return this.errorReply("You are not allowed to use filtered words in hangmans.");
			const params = text.split(',');

			this.checkCan('minigame', null, room);
			if (room.settings.hangmanDisabled) return this.errorReply("Hangman is disabled for this room.");
			this.checkChat();
			if (room.game) return this.errorReply(`There is already a game of ${room.game.title} in progress in this room.`);

			if (!params) return this.errorReply("No word entered.");
			const {phrase, hint} = Hangman.validateParams(params);

			const game = new Hangman(room, user, phrase, hint);
			room.game = game;
			game.display(user, true);

			this.modlog('HANGMAN');
			return this.addModAction(`A game of hangman was started by ${user.name} – use /guess to play!`);
		},
		createhelp: ["/hangman create [word], [hint] - Makes a new hangman game. Requires: % @ # &"],

		guess(target, room, user) {
			this.parse(`/choose ${target}`);
		},
		guesshelp: [
			`/guess [letter] - Makes a guess for the letter entered.`,
			`/guess [word] - Same as a letter, but guesses an entire word.`,
		],

		stop: 'end',
		end(target, room, user) {
			room = this.requireRoom();
			this.checkCan('minigame', null, room);
			this.checkChat();
			const game = this.requireGame(Hangman);
			game.end();
			this.modlog('ENDHANGMAN');
			return this.privateModAction(`The game of hangman was ended by ${user.name}.`);
		},
		endhelp: ["/hangman end - Ends the game of hangman before the man is hanged or word is guessed. Requires: % @ # &"],

		disable(target, room, user) {
			room = this.requireRoom();
			this.checkCan('gamemanagement', null, room);
			if (room.settings.hangmanDisabled) {
				return this.errorReply("Hangman is already disabled.");
			}
			room.settings.hangmanDisabled = true;
			room.saveSettings();
			return this.sendReply("Hangman has been disabled for this room.");
		},

		enable(target, room, user) {
			room = this.requireRoom();
			this.checkCan('gamemanagement', null, room);
			if (!room.settings.hangmanDisabled) {
				return this.errorReply("Hangman is already enabled.");
			}
			delete room.settings.hangmanDisabled;
			room.saveSettings();
			return this.sendReply("Hangman has been enabled for this room.");
		},

		display(target, room, user) {
			room = this.requireRoom();
			const game = this.requireGame(Hangman);
			if (!this.runBroadcast()) return;
			room.update();

			game.display(user, this.broadcasting);
		},

		''(target, room, user) {
			return this.parse('/help hangman');
		},

		random(target, room, user) {
			room = this.requireRoom();
			this.checkCan('mute', null, room);
			if (room.game) {
				throw new Chat.ErrorMessage(`There is already a game of ${room.game.title} running.`);
			}
			const {question, hint} = Hangman.getRandom(room.roomid);
			const game = new Hangman(room, user, question, hint);
			room.game = game;
			this.addModAction(`${user.name} started a random game of hangman - use /guess to play!`);
			game.display(user, true);
			this.modlog(`HANGMAN RANDOM`);
		},
		addrandom(target, room, user) {
			room = this.requireRoom();
			this.checkCan('mute', null, room);
			if (!hangmanData[room.roomid]) hangmanData[room.roomid] = {};
			if (!target) return this.parse('/help hangman');
			// validation
			const args = target.split(target.includes('|') ? '|' : ',');
			const {phrase} = Hangman.validateParams(args);
			if (!hangmanData[room.roomid][phrase]) hangmanData[room.roomid][phrase] = [];
			args.shift();
			hangmanData[room.roomid][phrase].push(...args);
			Hangman.save();
			this.privateModAction(`${user.name} added a random hangman with ${Chat.count(args.length, 'hints')}.`);
			this.modlog(`HANGMAN ADDRANDOM`, null, `${phrase}: ${args.join(', ')}`);
		},
		rr: 'removerandom',
		removerandom(target, room, user) {
			room = this.requireRoom();
			this.checkCan('mute', null, room);
			let [word, ...hints] = target.split(',');
			if (!toID(target) || !word) return this.parse('/help hangman');
			for (const [i, hint] of hints.entries()) {
				if (hint.startsWith('room:')) {
					const newID = hint.slice(5);
					const targetRoom = Rooms.search(newID);
					if (!targetRoom) {
						return this.errorReply(`Invalid room: ${newID}`);
					}
					this.room = targetRoom;
					room = targetRoom;
					hints.splice(i, 1);
				}
			}
			if (!hangmanData[room.roomid]) {
				return this.errorReply("There are no hangman words for this room.");
			}
			const roomKeys = Object.keys(hangmanData[room.roomid]);
			const roomKeyIDs = roomKeys.map(toID);
			const index = roomKeyIDs.indexOf(toID(word));
			if (index < 0) {
				return this.errorReply(`That word is not a saved hangman.`);
			}
			word = roomKeys[index];
			hints = hints.map(toID);

			if (!hints.length) {
				delete hangmanData[room.roomid][word];
				this.privateModAction(`${user.name} deleted the hangman entry for '${word}'`);
				this.modlog(`HANGMAN REMOVERANDOM`, null, word);
			} else {
				hangmanData[room.roomid][word] = hangmanData[room.roomid][word].filter(item => !hints.includes(toID(item)));
				if (!hangmanData[room.roomid][word].length) {
					delete hangmanData[room.roomid][word];
				}
				this.privateModAction(`${user.name} deleted ${Chat.count(hints, 'hints')} for the hangman term '${word}'`);
				this.modlog(`HANGMAN REMOVERANDOM`, null, `${word}: ${hints.join(', ')}`);
			}
			if (this.connection.openPages?.has(`hangman-${room.roomid}`)) {
				this.parse(`/hangman terms ${room.roomid}`);
			}
			Hangman.save();
		},
		terms(target, room, user) {
			room = this.requireRoom();
			return this.parse(`/j view-hangman-${target || room.roomid}`);
		},
	},

	hangmanhelp: [
		`/hangman allows users to play the popular game hangman in PS rooms.`,
		`Accepts the following commands:`,
		`/hangman create [word], [hint] - Makes a new hangman game. Requires: % @ # &`,
		`/hangman guess [letter] - Makes a guess for the letter entered.`,
		`/hangman guess [word] - Same as a letter, but guesses an entire word.`,
		`/hangman display - Displays the game.`,
		`/hangman end - Ends the game of hangman before the man is hanged or word is guessed. Requires: % @ # &`,
		`/hangman [enable/disable] - Enables or disables hangman from being started in a room. Requires: # &`,
		`/hangman random - Runs a random hangman, if the room has any added. Requires: % @ # &`,
		`/hangman addrandom [word], [...hints] - Adds an entry for [word] with the [hints] provided to the room's hangman pool. Requires: % @ # &`,
		`/hangman removerandom [word][, hints] - Removes data from the hangman entry for [word]. If hints are given, removes only those hints.` +
		` Otherwise it removes the entire entry. Requires: % @ # &`,
	],
};

export const pages: PageTable = {
	hangman(args, user) {
		const room = this.requireRoom();
		this.checkCan('mute', null, room);
		let buf = `<div class="pad"><h2>Hangman entries on ${room.title}</h2>`;
		const roomTerms = hangmanData[room.roomid];
		if (!roomTerms) {
			return this.errorReply(`No hangman terms found for ${room.title}.`);
		}
		for (const t in roomTerms) {
			buf += `<div class="infobox">`;
			buf += `<strong>${t}</strong>:<br />`;
			buf += roomTerms[t].map(
				hint => `<button class="button" name="send" value="/hangman rr ${t},${hint},room:${room.roomid}">${hint}</button>`
			);
			buf += `</div><br />`;
		}
		buf += `</div>`;
		return buf;
	},
};

export const roomSettings: SettingsHandler = room => ({
	label: "Hangman",
	permission: 'editroom',
	options: [
		[`disabled`, room.settings.hangmanDisabled || 'hangman disable'],
		[`enabled`, !room.settings.hangmanDisabled || 'hangman enable'],
	],
});
