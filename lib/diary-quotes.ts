/** Quotes for the Diary's back cover. One is drawn per user per day, without
 *  repeats until every quote has been shown (see drawQuote). Append new quotes
 *  at the end: saved state stores indexes into this list. */
export type DiaryQuote = { text: string; author: string };

export const DIARY_QUOTES: DiaryQuote[] = [
  { text: 'I never travel without my diary. One should always have something sensational to read in the train.', author: 'Oscar Wilde' },
  { text: 'Journal writing is a voyage to the interior.', author: 'Christina Baldwin' },
  { text: "Journaling is like whispering to one's self and listening at the same time.", author: 'Mina Murray' },
  { text: 'Keep a notebook. Travel with it, eat with it, sleep with it. Slap into it every stray thought that flutters up into your brain.', author: 'Jack London' },
  { text: "I write entirely to find out what I'm thinking, what I'm looking at, what I see, and what it means.", author: 'Joan Didion' },
  { text: 'Writing in a journal reminds you of your goals and of your learning in life. It offers a place where you can hold a deliberate, thoughtful conversation with yourself.', author: 'Robin Sharma' },
  { text: 'Tears are words that need to be written.', author: 'Paulo Coelho' },
  { text: 'As there are a thousand thoughts lying within a man that he does not know till he takes up the pen to write.', author: 'William Makepeace Thackeray' },
  { text: 'Paper is to write things down that we need to remember. Our brains are used to think.', author: 'Albert Einstein' },
  { text: 'My journal has become a paper mirror, a topographic map to my mind.', author: 'Anonymous' },
  { text: 'The world is a book and those who do not travel read only one page.', author: 'Saint Augustine' },
  { text: 'Travel far enough, you meet yourself.', author: 'David Mitchell' },
  { text: 'Travel changes you. As you move through this life and this world you change things slightly... And in return, life and travel leave marks on you.', author: 'Anthony Bourdain' },
  { text: "One's destination is never a place, but a new way of seeing things.", author: 'Henry Miller' },
  { text: "Live, travel, adventure, bless, and don't be sorry.", author: 'Jack Kerouac' },
  { text: 'Let your memory be your travel bag.', author: 'Aleksandr Solzhenitsyn' },
  { text: 'We wander for distraction, but we travel for fulfillment.', author: 'Hilaire Belloc' },
  { text: 'To awaken alone in a strange town is one of the pleasantest sensations in the world.', author: 'Freya Stark' },
  { text: 'Though we travel the world over to find the beautiful, we must carry it with us, or we find it not.', author: 'Ralph Waldo Emerson' },
  { text: 'Travel is like an uncertainty in a world of certainties.', author: 'Anonymous' },
  { text: 'Writing is as close as we get to keeping a hold on the thousand and one things... that go on slipping, like sand, through our fingers.', author: 'Salman Rushdie' },
  { text: 'Preserve your memories, keep them well, what you forget you can never retell.', author: 'Louisa May Alcott' },
  { text: 'A good journal entry ought to be a love letter to the world.', author: 'Anthony Doerr' },
  { text: 'We leave something of ourselves behind when we leave a place, we stay there, even though we go away.', author: 'Pascal Mercier' },
  { text: 'So much of who we are is where we have been.', author: 'William Langewiesche' },
  { text: 'Every diary is a travel guide to a country that no longer exists: Yesterday.', author: 'Proverb' },
  { text: 'Write hard and clear about what hurts.', author: 'Ernest Hemingway' },
  { text: 'To travel is to discover that everyone is wrong about other countries.', author: 'Aldous Huxley' },
  { text: "Life moves pretty fast. If you don't stop and look around once in a while, you could miss it.", author: 'Ferris Bueller' },
  { text: 'Fill your life with experiences, not things. Have stories to tell, not stuff to show.', author: 'Anonymous' },
  { text: 'We write to taste life twice, in the moment and in retrospect.', author: 'Anaïs Nin' },
  { text: 'A page a day is a volume a year.', author: 'Arthur Brisbane' },
  { text: 'Fill your paper with the breathings of your heart.', author: 'William Wordsworth' },
  { text: 'In the journal I do not just express myself more freely than I tend to do with any person; I create myself.', author: 'Susan Sontag' },
  { text: 'I can shake off everything as I write; my sorrows disappear, my courage is reborn.', author: 'Anne Frank' },
  { text: 'Keep a diary, and someday it will keep you.', author: 'Mae West' },
  { text: 'The pale ink is better than the best memory.', author: 'Chinese Proverb' },
  { text: 'I render my journal entries not for posterity, but for my own clarity.', author: 'Joan Didion' },
  { text: 'Keeping a journal: The short-term pain of writing brings long-term gain of clarity.', author: 'James Clear' },
  { text: 'Journaling is like paying attention to the present moment, on paper.', author: 'Julia Cameron' },
  { text: 'Your journal will never laugh at you or criticize you. It will be a silent, accepting friend.', author: 'Ruth Ann Schabacker' },
  { text: 'A journal is your completely private space to think, feel, and just be.', author: 'Christina Baldwin' },
  { text: 'Journaling is paying attention to your life.', author: 'Robin Sharma' },
  { text: 'What a wonderful thing is a journal! It is a mirror to the soul.', author: 'May Sarton' },
  { text: 'A journey is best measured in friends, rather than miles.', author: 'Tim Cahill' },
  { text: 'Not all those who wander are lost.', author: 'J.R.R. Tolkien' },
  { text: 'The journey of a thousand miles begins with one step.', author: 'Lao Tzu' },
  { text: 'Travel makes one modest. You see what a tiny place you occupy in the world.', author: 'Gustave Flaubert' },
  { text: 'The real voyage of discovery consists not in seeking new landscapes, but in having new eyes.', author: 'Marcel Proust' },
  { text: 'Life is either a daring adventure or nothing at all.', author: 'Helen Keller' },
  { text: 'To travel is to live.', author: 'Hans Christian Andersen' },
  { text: 'Take only memories, leave only footprints.', author: 'Chief Seattle' },
  { text: "Travel isn't always pretty. It hurts sometimes; it even breaks your heart. But that's OK. The journey changes you.", author: 'Anthony Bourdain' },
  { text: "Oh, the places you'll go!", author: 'Dr. Seuss' },
  { text: 'Adventure is worthwhile in itself.', author: 'Amelia Earhart' },
  { text: 'Travel leaves you speechless, then turns you into a storyteller.', author: 'Ibn Battuta' },
  { text: 'It is good to have an end to journey toward; but it is the journey that matters, in the end.', author: 'Ursula K. Le Guin' },
  { text: 'Writing a travel journal is capturing a moment in time before it fades away.', author: 'Anonymous' },
  { text: 'We travel, some of us forever, to seek other states, other lives, other souls.', author: 'Anaïs Nin' },
];

export type QuoteState = { day: string; current: number; remaining: number[] };

/**
 * Today's quote for one user. Same day: the quote already drawn. A new day:
 * take a random index from what is left of this round; once the round is
 * used up, start a new one with every index. A new round never opens with
 * the quote just shown, but that quote still comes up later in the round.
 */
export function drawQuote(state: QuoteState | null, today: string, rand: () => number = Math.random): QuoteState {
  const n = DIARY_QUOTES.length;
  if (state && state.day === today && state.current >= 0 && state.current < n) return state;
  let pool = (state?.remaining || []).filter((i, k, a) => Number.isInteger(i) && i >= 0 && i < n && a.indexOf(i) === k);
  let from = pool;
  if (pool.length === 0) {
    pool = [...Array(n).keys()];
    from = pool.filter((i) => i !== state?.current);
  }
  const pick = from[Math.floor(rand() * from.length)];
  return { day: today, current: pick, remaining: pool.filter((i) => i !== pick) };
}
