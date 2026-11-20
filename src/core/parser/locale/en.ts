/**
 * English phrase table (AGENTS.md §8.7). iOS exports prefix several markers
 * with U+200E (LRM), so the marker regexes accept an optional LRM directly
 * before the marker text; the matched marker is stripped from stored bodies.
 */
import type { LocalePatterns } from './types';

export const en: LocalePatterns = {
  id: 'en',

  meridiem: {
    am: ['AM', 'am', 'Am', 'a.m.', 'A.M.', 'a. m.', 'A. M.'],
    pm: ['PM', 'pm', 'Pm', 'p.m.', 'P.M.', 'p. m.', 'P. M.'],
  },

  system: [
    // §8.6.1: the actor part must not cross an author separator (": "),
    // otherwise ordinary messages like "Sara: I added sugar" become system
    // events and lose their author. Actor names never contain ": ".
    /^Messages and calls are end-to-end encrypted\..*$/u,
    /^\u200E?Messages and calls are end-to-end encrypted\..*$/u,
    /^(?:\u200E?[^:]+|You) created group .*$/u,
    /^(?:\u200E?[^:]+|You) added (?:.+|you)$/u,
    /^(?:\u200E?[^:]+|You) removed (?:.+|you)$/u,
    /^(?:\u200E?[^:]+|You) left$/u,
    /^You were added$/u,
    /^You were removed$/u,
    // The subject tail may legitimately contain ": " (old subject names).
    /^(?:\u200E?[^:]+|You) changed the subject from .*$/u,
    /^(?:\u200E?[^:]+|You) changed this group(?:'s|\u2019s) icon$/u,
    /^(?:\u200E?[^:]+|You) changed their phone number to a new number\..*$/u,
    /^Disappearing messages? .*$/u,
    // "turned on" keeps the actor before any ": ".
    /^(?:\u200E?[^:]+|You) turned on disappearing messages\..*$/u,
    /^(?:\u200E?[^:]+|You) changed the group description\..*$/u,
    /^(?:\u200E?[^:]+|You) joined the group .*$/u,
    /^Tap to learn more\.$/u,
  ],

  deleted: [/^\u200E?This message was deleted\.?$/u, /^\u200E?You deleted this message\.?$/u],

  edited: [/\u200E?<This message was edited>\s*$/u],

  omitted: [
    { re: /^\u200E?<Media omitted>$/u, mediaType: 'other' },
    { re: /^\u200E?image omitted$/iu, mediaType: 'image' },
    { re: /^\u200E?video omitted$/iu, mediaType: 'video' },
    { re: /^\u200E?audio omitted$/iu, mediaType: 'audio' },
    { re: /^\u200E?sticker omitted$/iu, mediaType: 'sticker' },
    { re: /^\u200E?GIF omitted$/iu, mediaType: 'gif' },
    { re: /^\u200E?document omitted$/iu, mediaType: 'document' },
    { re: /^\u200E?Contact card omitted$/iu, mediaType: 'contact-card' },
  ],

  // Anchored per §8.7 (all locale regexes are anchored) — also keeps the
  // no-close adversarial case linear (§8.7: no catastrophic backtracking).
  attachedIos: /^\u200E?<attached: ([^>]+)>/u,
  attachedAndroid: /^(.+) \(file attached\)$/u,

  calls: [
    /^\u200E?Voice call$/u,
    /^\u200E?Video call$/u,
    /^\u200E?Missed voice call$/u,
    /^\u200E?Missed video call$/u,
  ],

  pollPrefix: 'POLL:',
  pollOption: /^OPTION: (.+?) \((\d+) votes?\)$/u,
  locationPrefix: 'location: ',
};
