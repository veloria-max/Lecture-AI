'use strict';
// Seeded in-memory demo data for the home feed (date-grouped
// conversations with time, duration, owner, summary, speakers, thumbnail).

function seg(t, speaker, text) { return { t, speaker, text }; }

const USER = { name: 'Sam', email: 'sam@example.com', avatar: 'S', color: '#f6a21e' };

const CONVERSATIONS = [
  {
    id: 'c_note_1',
    title: 'Note',
    createdAt: '2026-10-17T17:42:00',
    durationSec: 7,
    owner: 'Sam',
    speakers: ['Sam'],
    speakerColors: { Sam: '#f6a21e' },
    thumbnail: null,
    segments: [ seg(0.0, 'Sam', 'Quick voice note to self — remember to send the design review link before the sync.') ],
    summary: '',
    outline: [],
    actionItems: [],
  },
  {
    id: 'c_complex_numbers',
    title: 'Introduction to Complex Numbers',
    createdAt: '2026-10-15T16:43:00',
    durationSec: 5520, // 1h 32m
    owner: 'Sam',
    speakers: ['Sam'],
    speakerColors: { Sam: '#f6a21e' },
    thumbnail: null,
    segments: [
      seg(0.0, 'Sam', 'Today we are introducing complex numbers, starting from the imaginary unit i.'),
      seg(9.5, 'Sam', 'By definition i squared equals negative one, which has no real-number solution.'),
      seg(18.2, 'Sam', 'This lets us solve quadratic and higher-order equations that were previously unsolvable.'),
      seg(27.0, 'Sam', 'A complex number has a real part and an imaginary part, written a plus b i.'),
      seg(35.4, 'Sam', 'Addition and subtraction work component-wise; multiplication uses the distributive law and i squared equals minus one.'),
      seg(46.1, 'Sam', 'We will also cover the complex conjugate and the modulus in the next section.'),
    ],
    summary: 'The lecture introduces complex numbers, starting with the definition of the imaginary unit i, where i squared equals -1. The instructor explains how this concept allows for solving quadratic and higher-order equations that were previously unsolvable. Key topics include the distinction between real and imaginary parts, basic arithmetic operations like addition and multiplication, and the role of the complex conjugate and modulus.',
    outline: [
      { t: 0.0, label: 'Defining the imaginary unit i' },
      { t: 18.2, label: 'Why complex numbers matter' },
      { t: 27.0, label: 'Real and imaginary parts' },
      { t: 35.4, label: 'Arithmetic with complex numbers' },
    ],
    actionItems: [
      { owner: 'Sam', text: 'Review complex conjugate and modulus before next lecture.' },
    ],
  },
  {
    id: 'c_meeting_notes',
    title: 'Study Group Sync',
    createdAt: '2026-10-15T14:57:00',
    durationSec: 1440, // 24 min
    owner: 'Sam',
    speakers: ['Alex', 'Imani'],
    speakerColors: { Alex: '#f6a21e', Imani: '#7b3fe4' },
    thumbnail: 'purple',
    segments: [
      seg(0.0, 'Alex', 'Thanks for hopping on. I wanted to plan how we split up the problem set.'),
      seg(6.8, 'Imani', 'Sure. I can take the complex-number questions; you take the proofs?'),
      seg(14.2, 'Alex', 'Works for me. Can you share your notes from Thursday\'s lecture too?'),
      seg(20.9, 'Imani', 'Of course — I\'ll send my notes and a draft of my answers by Friday.'),
    ],
    summary: 'Alex and Imani split up the problem set and agreed to share lecture notes.',
    outline: [
      { t: 0.0, label: 'Intro and purpose of the call' },
      { t: 6.8, label: 'Splitting up the problem set' },
      { t: 14.2, label: 'Next steps: share notes' },
    ],
    actionItems: [
      { owner: 'Imani', text: 'Send lecture notes and draft answers by Friday.' },
    ],
  },
];

const CHANNELS = [{ id: 'general', name: 'General' }];

// Scripted "live" meeting used by the WebSocket recording demo.
const LIVE_SCRIPT = [
  seg(0.0, 'You', 'Alright, this is a live demo of the transcription stream.'),
  seg(2.6, 'You', 'Words should appear roughly in real time as I speak.'),
  seg(6.1, 'Guest', 'And it can tell us apart — each line is tagged with a speaker.'),
  seg(10.4, 'You', 'Exactly. Every segment carries a timestamp and a speaker label.'),
  seg(15.0, 'Guest', 'What happens when I pause and come back?'),
  seg(18.3, 'You', 'The stream just keeps its place and resumes — no lost context.'),
  seg(23.7, 'Guest', 'Nice. And at the end?'),
  seg(26.2, 'You', 'When you stop, it saves the conversation and generates a summary and action items.'),
  seg(32.5, 'Guest', 'Let’s stop here and see the summary.'),
];

module.exports = { USER, CONVERSATIONS, CHANNELS, LIVE_SCRIPT };
