import { int, pick, shuffled, type Rng } from './rng';

// The prompt list. Every prompt is made from a family: some are written out, some are built from a template and a list (a trope, a job, a place...),
// so the same board is never made twice. Fiction only. MM romance and queer male leads are the heart of it, with room to stretch.

export type Family = 'trope' | 'character' | 'setting' | 'format' | 'playful' | 'stretch' | 'challenge' | 'yours' | 'reread';
export const FAMILY_LABEL: Record<Family, string> = { trope: 'Trope', character: 'Characters', setting: 'Setting', format: 'Format', playful: 'Playful', stretch: 'Stretch', challenge: 'Challenge', yours: 'Yours', reread: 'Reread' };

export const TROPES = ['fake dating', 'grumpy and sunshine', 'enemies to lovers', 'rivals to lovers', 'friends to lovers', 'second chance romance', 'forced proximity', 'only one bed', 'found family', 'hurt/comfort',
  'slow burn', 'fated mates', 'age gap', 'boss and employee', 'brother\'s best friend', 'best friend\'s dad', 'bodyguard', 'secret relationship', 'marriage of convenience', 'bi awakening',
  'gay for you', 'closeted lead', 'coming out', 'small town', 'big city, small apartment', 'roommates', 'neighbors', 'workplace romance', 'celebrity and a normal guy', 'fish out of water', 'opposites attract',
  'mutual pining', 'unrequited love', 'insta-love', 'love triangle', 'jealousy', 'protective hero', 'caretaker', 'sick day tenderness', 'amnesia', 'second-chance family', 'single dad', 'surprise baby',
  'matchmaking', 'wedding fake-out', 'holiday romance', 'road trip', 'summer fling that turns serious', 'long-distance relationship', 'ex-to-friend-to-lover', 'teacher and student teacher (both adults)',
  'professor and grad student (both adults)', 'coach and player', 'teammates', 'rival teams', 'undercover', 'witness protection', 'detective and suspect', 'partners on the job', 'heist crew', 'stranded together',
  'marriage in name only', 'arranged marriage', 'royal romance', 'prince and knight', 'forbidden love', 'mafia romance', 'enemies, but one is an assassin', 'vampire and human', 'shifter mates', 'witch and mundane',
  'demon and angel', 'ghost romance', 'monster romance', 'dragon shifter', 'omegaverse', 'reincarnation', 'time travel', 'soulmates', 'curse breaking', 'band romance', 'fake fiancé', 'proposal gone wrong',
  'praise kink-free sweet romance', 'a good grovel', 'a big misunderstanding that gets fixed', 'secret identity', 'writing partners', 'mentor and mentee', 'bartender and regular', 'a dare', 'a bet',
  'a pen pal romance', 'a ghostwriter', 'sunshine hero with a dark past', 'a grumpy older guy and a cheerful younger one', 'twins\' best friend', 'cinnamon roll and a bad boy', 'a cowboy', 'a rancher'];

export const OCCUPATIONS = ['hockey player', 'football player', 'baseball player', 'soccer player', 'swimmer', 'figure skater', 'boxer', 'wrestler', 'runner', 'climber', 'coach', 'referee', 'personal trainer',
  'firefighter', 'police officer', 'detective', 'FBI agent', 'bodyguard', 'soldier', 'veteran', 'paramedic', 'doctor', 'nurse', 'vet', 'therapist', 'teacher', 'professor', 'student', 'librarian',
  'bookstore owner', 'barista', 'baker', 'chef', 'bartender', 'florist', 'farmer', 'rancher', 'mechanic', 'carpenter', 'electrician', 'architect', 'lawyer', 'judge', 'journalist', 'photographer',
  'artist', 'tattoo artist', 'musician', 'rock star', 'actor', 'dancer', 'writer', 'editor', 'influencer', 'billionaire', 'CEO', 'assistant', 'accountant', 'pilot', 'flight attendant', 'sailor', 'park ranger',
  'game designer', 'programmer', 'scientist', 'astronaut', 'spy', 'assassin', 'thief', 'pirate', 'prince', 'king', 'knight', 'wizard', 'vampire', 'wolf shifter', 'demon', 'angel', 'ghost', 'dragon',
  'fae', 'mage', 'monster hunter', 'private investigator', 'stuntman', 'drag performer', 'fashion designer', 'interior designer', 'event planner', 'wedding planner', 'hotel owner', 'innkeeper'];

export const DYNAMICS = ['co-workers', 'rival teammates', 'roommates', 'neighbors', 'exes', 'childhood best friends', 'strangers who meet by accident', 'a boss and an employee', 'a coach and a player',
  'a bodyguard and a client', 'a detective and a witness', 'two single dads', 'an older man and a younger man', 'a human and a monster', 'a prince and a commoner', 'a celebrity and a fan',
  'two men who are fake-married', 'a grump and a ray of sunshine', 'two rivals in the same field', 'an assassin and his target', 'an introvert and an extrovert', 'a widower and a flirt',
  'a runaway and a rescuer', 'two men stuck in a small town', 'a student and a teacher (both adults)', 'a landlord and a tenant', 'two writers', 'two chefs', 'a vet and a rancher'];

export const TRAITS = ['grieving', 'closeted', 'newly out', 'neurodivergent', 'deaf or hard of hearing', 'a wheelchair user', 'living with a chronic illness', 'a single parent', 'in recovery',
  'the youngest sibling', 'an immigrant', 'a person of color', 'a former soldier', 'a former athlete', 'secretly famous', 'afraid of commitment', 'a big flirt', 'painfully shy', 'a workaholic',
  'bad at feelings', 'an orphan', 'estranged from family', 'a late bloomer', 'bi', 'trans', 'ace or demisexual', 'a morally gray hero', 'a villain who gets redeemed', 'older than 40', 'a college freshman'];

export const STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming'];
export const COUNTRIES = ['England', 'Scotland', 'Ireland', 'Wales', 'Canada', 'Australia', 'New Zealand', 'France', 'Italy', 'Spain', 'Germany', 'Greece', 'Iceland', 'Norway', 'Sweden', 'Japan', 'South Korea',
  'India', 'Thailand', 'Mexico', 'Brazil', 'Argentina', 'South Africa', 'Egypt', 'Morocco', 'Scotland\'s Highlands', 'Switzerland', 'Portugal', 'the Netherlands', 'Turkey', 'Russia', 'the Caribbean', 'Hawaii',
  'the Arctic', 'a made-up country', 'another planet'];
export const SETTING_TYPES = ['a small town', 'a big city', 'a college campus', 'a ranch', 'a farm', 'a lighthouse', 'a cabin in the woods', 'a ski resort', 'a beach town', 'an island', 'a cruise ship', 'a train',
  'a road trip', 'a hotel', 'a bed and breakfast', 'a bookstore', 'a bakery or café', 'a bar', 'a hospital', 'a police station', 'a fire station', 'a locker room', 'an arena', 'a film set', 'a concert tour',
  'a castle', 'a magical academy', 'a haunted house', 'a spaceship', 'a post-apocalyptic wasteland', 'a dystopian city', 'a dungeon', 'a forest', 'a desert', 'a mountain', 'a monastery', 'an office tower',
  'a wedding', 'a family reunion', 'a summer camp', 'a boarding school', 'a circus or carnival', 'a theater', 'a prison', 'a lake house', 'a Christmas market', 'a vineyard', 'a mansion', 'a pirate ship',
  'a space station', 'a city during a blackout', 'a snowed-in house'];
export const ERAS = ['the 1920s', 'the 1940s', 'the 1960s', 'the 1970s', 'the 1980s', 'the 1990s', 'the 2000s', 'the Regency era', 'the Victorian era', 'the Wild West', 'the Middle Ages', 'ancient times', 'the far future', 'the near future', 'an alternate history'];
export const SEASONS = ['winter', 'spring', 'summer', 'autumn', 'Christmas', 'Halloween', 'Valentine\'s Day', 'New Year\'s Eve', 'a long weekend', 'the holidays', 'a wedding season', 'a heat wave', 'a blizzard', 'Pride month', 'the playoffs'];

export const COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'black', 'white', 'gray', 'brown', 'gold', 'silver', 'rainbow', 'pastel', 'neon'];
export const COVER_OBJECTS = ['a hockey stick', 'a cityscape', 'a mountain', 'water', 'a flower', 'a heart', 'a dragon', 'a wolf', 'a castle', 'a crown', 'a sword', 'a book', 'a key', 'a car', 'a cat or a dog', 'a bird',
  'a star or the moon', 'a snowy scene', 'a beach', 'a suit', 'a uniform', 'two men back to back', 'two men facing each other', 'a silhouette', 'an illustrated couple', 'a handwritten font', 'a foil title',
  'a hand reaching', 'a tattoo', 'a pair of glasses', 'a cup of coffee', 'a bed', 'a door', 'a ship', 'an animal in a suit'];
export const TITLE_WORDS = ['love', 'heart', 'night', 'day', 'wild', 'dark', 'light', 'broken', 'sweet', 'last', 'first', 'red', 'blue', 'black', 'gold', 'fire', 'ice', 'snow', 'storm', 'king', 'prince', 'lord', 'wolf',
  'dragon', 'devil', 'angel', 'demon', 'ghost', 'shadow', 'blood', 'bone', 'steel', 'stone', 'glass', 'rose', 'thorn', 'garden', 'house', 'home', 'road', 'river', 'sea', 'moon', 'sun', 'star', 'sky', 'game', 'play',
  'rules', 'truth', 'lie', 'secret', 'promise', 'kiss', 'touch', 'chase', 'crush', 'fall', 'rise', 'break', 'save', 'keep', 'hold', 'mine', 'his', 'ours', 'forever', 'again', 'never', 'always', 'one', 'two',
  'three', 'seven', 'hundred', 'million', 'christmas', 'summer', 'winter', 'boy', 'man', 'brother', 'stranger'];
export const TITLE_KINDS = ['a one-word title', 'a title that is a person\'s name', 'a title with a number in it', 'a title with a color in it', 'a title with an animal in it', 'a title with a food in it', 'a title that is a question',
  'a title with a place in it', 'a title with the word "the"', 'a title longer than five words', 'a title with a verb', 'a title with a pun', 'a title that rhymes', 'a title with a weather word', 'a title with a body part',
  'a title with a family word (brother, dad, son...)', 'a title with a job in it', 'a title with a song in it', 'a title that sounds like a warning'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWYZ'.split('');

const written = {
  format: ['Listen to an audiobook with two narrators', 'Listen to an audiobook with a single narrator', 'Listen to an audiobook with a full cast', 'Listen to an audiobook from a narrator you have not heard before',
    'Listen to an audiobook from a narrator you love', 'Listen to an audiobook at a speed faster than usual', 'Read a book in a different format than you usually pick', 'Read an ebook you got free or on sale',
    'Read a book from Kindle Unlimited', 'Read a physical book from your shelves', 'Read a book you bought this month', 'Read a book by an author you have never read', 'Read a book by an author you have read at least five times',
    'Read a book from the oldest part of your TBR', 'Read a book that has been on your TBR for over a year', 'Read a novella', 'Read a short story collection', 'Read an anthology', 'Read a standalone', 'Read a debut',
    'Read a book that is the first in a series with 5 or more books', 'Read a book from a duet or a trilogy', 'Read a book from a completed series', 'Read a book that came out this year', 'Read a book with over 80% five-star ratings',
    'Read a book with a rating under 4 stars on a book site', 'Read a book recommended to you by a friend', 'Read a book from a recommendation list', 'Read a book that was a gift', 'Read a book with a dual point of view',
    'Read a book in first person', 'Read a book in third person', 'Read a book with multiple points of view', 'Read a book you can finish in a day', 'Read a book you will finish in a weekend', 'Read a book while traveling',
    'Read a book outside', 'Read a book with a spicy level you do not usually pick (higher or lower)', 'Read a closed-door romance', 'Read a book with a short, one-page prologue', 'Read a book with maps or illustrations inside',
    'Read a book that is part of a shared universe', 'Read a book connected to a series you finished', 'Read the last book in a series you started', 'Read book 2 of any series you have started', 'Read a spin-off',
    'Read a book with a series name that has a number in it', 'Read a bonus novella from a series you love', 'Read a book from a series you have had on pause for over a year', 'Listen to a book you also own as an ebook'],
  numbers: ['Read a book with under {n} pages', 'Read a book with over {n} pages', 'Listen to an audiobook under {h} hours', 'Listen to an audiobook over {h} hours', 'Read a book published in {y}', 'Read a book published before {y}'],
  playful: ['Read a book whose cover makes you smile', 'Read a book you picked only for its cover', 'Read a book with the ugliest cover on your TBR', 'Read a book with a cover you would be happy to show off', 'Read a book with an author photo on it',
    'Read a book with two authors', 'Read a book by an author with a pen name', 'Read the book closest to the number on the die you last rolled (count down your TBR)', 'Read the third book on your Up Next list',
    'Read a book with a character who shares your name or initials', 'Read a book with a character named after a month, a jewel, or a flower', 'Read a book whose lead has a nickname', 'Read a book with a pet in it',
    'Read a book where food plays a big part', 'Read a book that includes a letter, a text chain, or an email', 'Read a book with a first line that grabs you', 'Read a book with a happy ending you can already predict'],
  reread: ['Reread a favorite', 'Reread the first book of a series you love', 'Reread a book you rated five stars', 'Reread a YA fantasy or dystopian favorite', 'Reread a book you read more than two years ago', 'Reread a book that made you cry',
    'Reread a book that made you laugh out loud', 'Reread the first book in a series before its newest book', 'Reread a book you only read once, then tell someone about it', 'Reread a book as an audiobook'],
};

const stretch = {
  ya: ['Read a YA fantasy you have not read before', 'Read a YA dystopian you have not read before', 'Read the next book in a YA series you started', 'Read a YA book with a queer lead', 'Read a YA book with a chosen one',
    'Read a YA book with a love triangle (and decide who you root for)', 'Read a YA fantasy with a magic school', 'Read a YA fantasy with dragons', 'Read a YA dystopian with a rebellion', 'Read a YA book set after the world ended',
    'Read a YA retelling', 'Read a YA book with a found family', 'Read a YA science fiction', 'Read a YA mystery', 'Read a YA book that has been made into a movie or show', 'Read a YA book you loved as a teen',
    'Read a YA fantasy by a debut author', 'Read a YA fantasy with a sword fight', 'Read a YA book with a map at the front', 'Read a YA book with a male lead who has a secret'],
  scifi: ['Read a LitRPG or GameLit book', 'Read a book where the lead is trapped in a game or a dungeon', 'Read a space opera', 'Read a post-apocalyptic survival story', 'Read a sci-fi with a queer male lead', 'Read a book about a heist',
    'Read a fantasy adventure with a quest', 'Read a book with a talking animal or a cat', 'Read a book with a system, levels, or stats', 'Read a sci-fi comedy', 'Read a time travel story', 'Read an alien first-contact story',
    'Read a cyberpunk book', 'Read a book set on a spaceship', 'Read a book with a robot or an AI as a main character', 'Read a swashbuckling pirate adventure', 'Read a portal fantasy', 'Read a fantasy with a thief as the lead',
    'Read a sword-and-sorcery fantasy', 'Read the next book in an adventure series you started', 'Read a book that makes you laugh while the world burns', 'Read a survival story', 'Read an epic fantasy under 400 pages',
    'Read a urban fantasy with a queer lead', 'Read a book with a dungeon crawl', 'Read a book where the monsters are the heroes'],
  mystery: ['Read a mystery with a queer male detective', 'Read a cozy mystery', 'Read a psychological thriller', 'Read a suspense with a twist ending', 'Read a locked-room mystery', 'Read a cold case story', 'Read a serial killer thriller',
    'Read a whodunit', 'Read a legal thriller', 'Read a book with an unreliable narrator', 'Read a spy story', 'Read a small-town mystery', 'Read a mystery with a missing person', 'Read a murder mystery set at a school',
    'Read a book with a dual timeline mystery', 'Read a police procedural with a queer lead', 'Read a gothic suspense', 'Read a thriller with a countdown', 'Read a mystery with a romance on the side', 'Read the next book in a mystery series you started',
    'Read a heist mystery', 'Read a mystery set in another country', 'Read a haunted house story', 'Read a cozy mystery with a pet', 'Read a book where the detective is the love interest'],
  other: ['Read a romance with a woman and a man (MF)', 'Read an FF romance', 'Read a polyamorous romance', 'Read a het romance by a queer author', 'Read a historical romance', 'Read a western', 'Read a horror novel', 'Read a gothic novel',
    'Read a fairy-tale retelling', 'Read a Greek myth retelling', 'Read a sports story that is not a romance', 'Read a book with a queer male lead where romance is not the main plot', 'Read a coming-of-age story',
    'Read a literary novel with queer men in it', 'Read a family saga', 'Read a book of short stories', 'Read a book in translation', 'Read a book set in a country you have never read about',
    'Read a contemporary fiction with no romance', 'Read a comedy', 'Read a dark romance outside your usual pairing', 'Read a paranormal romance with a pairing you rarely read', 'Read a book by a trans or nonbinary author',
    'Read a book about friendship between men', 'Read a book from a genre you have read at most twice', 'Read a graphic novel or manga (fiction)', 'Read a novel in verse', 'Read a book that won a literary prize',
    'Read a historical fiction about queer men', 'Read a romantic comedy', 'Read a book that is hard to put in one genre', 'Read a book with an ensemble cast', 'Read a book with no kissing at all',
    'Read a book that breaks your usual rules', 'Read a book about a boy and his dog', 'Read a book about brothers', 'Read a book you suspect you will not like, and be fair to it'],
};

const themed: Record<string, string[]> = {
  campus: ['Read a book set at a college', 'Read a book with a professor lead', 'Read a book with a roommate trope', 'Read a book with a college athlete', 'Read a book with a study date', 'Read a book that starts on move-in day'],
  rink: ['Read a hockey romance', 'Read a book with a goalie', 'Read a book with a captain', 'Read a book with a team on a road trip', 'Read a book that happens during the playoffs', 'Read a sports book that is not hockey'],
  royal: ['Read a book with a prince or a king', 'Read a book with a knight', 'Read a book with a court full of secrets', 'Read a book with a coronation', 'Read a book with a magical bloodline', 'Read a book with a forbidden royal romance'],
  fated: ['Read a book with a shifter', 'Read a book with a vampire', 'Read a book with a witch or a mage', 'Read a book with a fated bond', 'Read a book with a full moon', 'Read a book with a haunted lead'],
  neon: ['Read a book set in a big city at night', 'Read a book with a celebrity', 'Read a book with a band', 'Read a book with a stage', 'Read a book with a fake relationship for the press', 'Read a book set in a club'],
  cozy: ['Read a book set in a small town', 'Read a book with a bakery, a bookshop, or a café', 'Read a book that happens over the holidays', 'Read a book with a sick day', 'Read a book with a stray pet', 'Read a book with a town festival'],
  stormy: ['Read a book with a crime', 'Read a book with a secret', 'Read a book where someone is not who they seem', 'Read a book with a storm', 'Read a book where the setting is almost a character', 'Read a book with a villain you love to hate'],
  wild: ['Read a book that starts with a dare', 'Read a book where the lead breaks the rules', 'Read a book that surprises you in the first chapter', 'Read a book that is nothing like your last one', 'Read a book that your friend begged you to read', 'Read a book you picked at random'],
};
export type ThemeKey = keyof typeof themed;
export const THEME_KEYS = Object.keys(themed) as ThemeKey[];

export const BOSSES = [
  { title: 'The Marathoner', text: 'Boss: read three books in a row from the same series' },
  { title: 'The Sprinter', text: 'Boss: finish a full-length book in one day' },
  { title: 'The Heavyweight', text: 'Boss: read a book of 500 pages or more, or 15 hours or more as an audiobook' },
  { title: 'The Explorer', text: 'Boss: read a book by an author you have never read, in a genre you read the least' },
  { title: 'The Completionist', text: 'Boss: finish an entire series you started' },
  { title: 'The Time Traveler', text: 'Boss: reread a favorite, then read its newest sequel' },
  { title: 'The Cartographer', text: 'Boss: read a book set in a place you have never read about, then find it on a map' },
  { title: 'The Matchmaker', text: 'Boss: read a book with a trope you love and a trope you usually avoid, in the same book' },
  { title: 'The Audiophile', text: 'Boss: listen to an audiobook with two or more narrators and a dual point of view' },
  { title: 'The Wildcard', text: 'Boss: ask a friend to pick any book from your TBR for you, and read it' },
  { title: 'The Archaeologist', text: 'Boss: read the oldest book on your TBR' },
  { title: 'The Cheerleader', text: 'Boss: read a book and tell someone why they should read it' },
];
export const QUESTS = ['Finish it in three days or fewer', 'Finish it in a single day', 'Listen to it instead of reading it', 'Read it outside', 'Add three tags to it in the journal', 'Add a note to your day log', 'Save a favorite passage',
  'Read it in one sitting', 'Read it without checking your phone', 'Pair it with a snack from the book', 'Read it in a new place', 'Read it in the bath, a park, or a café', 'Read it with a friend', 'Recommend it to someone',
  'Rate it before the next sentence of another book', 'Read it before bed every night', 'Read it on a weekend', 'Finish it before the next full moon', 'Read the epilogue first thing the next day', 'Guess the ending, then check',
  'Read it with a cup of tea or coffee', 'Pick the book up and start it within an hour of landing', 'Start it within the day', 'Read a chapter aloud', 'Send a friend a photo of your favorite line', 'Finish it without skipping ahead',
  'Dress up as your favorite character for a chapter', 'Match it to a challenge prompt', 'Add a cover to it in the journal if it is missing one'];

export const BONUS_LINES = ['A tailwind pushes you ahead', 'A shortcut through the stacks', 'You find a secret door', 'The audiobook is on double speed', 'A friend slides you the next book', 'A lucky bookmark falls out', 'You skip a boring chapter',
  'A kind librarian points the way', 'The plot gets good right away', 'A dragon gives you a lift'];
export const PENALTY_LINES = ['A plot twist sends you back', 'The book gets lost in the couch', 'A cliffhanger makes you reread', 'A slow middle drags you back', 'You fall into a reading slump', 'An unexpected epilogue pulls you back',
  'A scary storm slows you down', 'You get distracted by a new release', 'A bookmark falls out and you lose your place', 'The sequel is on hold at the library'];
export const ITEM_LINES = ['You find a token in a used bookstore', 'A fan leaves you a gift', 'A book fairy leaves a surprise', 'A stranger hands you something shiny', 'A treasure chest sits in the road', 'A tote bag with a surprise inside'];
export const TILE_BITS = ['star', 'moon', 'fire', 'leaf', 'wave', 'crown', 'key', 'rose', 'bolt', 'feather'];

const ADJ = ['Velvet', 'Midnight', 'Golden', 'Wild', 'Cozy', 'Moonlit', 'Reckless', 'Gilded', 'Whispering', 'Scarlet', 'Neon', 'Quiet', 'Stormy', 'Sunlit', 'Dusty', 'Electric', 'Secret', 'Fearless', 'Frosted', 'Tangled', 'Sweet', 'Savage', 'Hidden', 'Lucky', 'Enchanted', 'Bold', 'Wicked', 'Tender', 'Roaring', 'Faded'];
const NOUN = ['Gauntlet', 'Odyssey', 'Pilgrimage', 'Expedition', 'Quest', 'Marathon', 'Tour', 'Labyrinth', 'Voyage', 'Road Trip', 'Chase', 'Treasure Hunt', 'Pursuit', 'Adventure', 'Crusade', 'Passage', 'Circuit', 'Trail', 'Carnival', 'Masquerade', 'Rally', 'Safari', 'Heist', 'Showdown', 'Escapade'];
export const boardName = (r: Rng) => `The ${pick(r, ADJ)} ${pick(r, NOUN)}`;

export interface Extras {
  occupations?: string[]; tropes?: string[]; places?: string[];
  challenge?: { challenge: string; label: string }[]; yours?: string[];
}

const dedupe = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
const lc = (s: string) => s.toLowerCase();
const an = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');

/** One prompt from a family, avoiding any text already used on the board. Returns null if the family has nothing left. */
export function makePrompt(family: Family, r: Rng, used: ReadonlySet<string>, x: Extras = {}, theme?: ThemeKey): { text: string; note?: string } | null {
  const tropes = dedupe([...TROPES, ...(x.tropes ?? []).map(lc)]);
  const jobs = dedupe([...OCCUPATIONS, ...(x.occupations ?? []).map(lc)]);
  const places = dedupe([...STATES, ...COUNTRIES, ...(x.places ?? [])]);
  const attempt = (): { text: string; note?: string } | null => {
    switch (family) {
      case 'trope': {
        const k = int(r, 0, 5);
        const t = pick(r, tropes);
        if (k === 0) return { text: `Read a book with the ${t} trope` };
        if (k === 1) return { text: `Read a book where ${t} drives the plot` };
        if (k === 2) return { text: `Read a book with ${t} and a ${pick(r, SEASONS)} setting` };
        if (k === 3) return { text: `Read a ${pick(r, ['slow-burn', 'steamy', 'sweet', 'angsty', 'funny', 'tender'])} book with the ${t} trope` };
        if (k === 4) return { text: `Read a book that pairs ${t} with ${pick(r, tropes)}` };
        return { text: `Read a book where the ${t} trope is done well, and tell yourself why` };
      }
      case 'character': {
        const k = int(r, 0, 5);
        if (k === 0) { const j = pick(r, jobs); return { text: `Read a book where one of the leads is ${an(j)} ${j}` }; }
        if (k === 1) return { text: `Read a book about ${pick(r, DYNAMICS)}` };
        if (k === 2) return { text: `Read a book where one of the leads is ${pick(r, TRAITS)}` };
        if (k === 3) { const a = pick(r, jobs); let b = pick(r, jobs); if (a === b) b = pick(r, jobs); return { text: `Read a book with ${an(a)} ${a} and ${an(b)} ${b}` }; }
        if (k === 4) return { text: `Read a book where both leads are ${pick(r, ['over 30', 'under 25', 'in their forties', 'former rivals', 'new in town', 'lonely', 'stubborn', 'funny'])}` };
        return { text: `Read a book with a ${pick(r, ['best friend', 'sidekick', 'meddling family member', 'nosy neighbor', 'grumpy boss', 'loyal pet'])} who steals the show` };
      }
      case 'setting': {
        const k = int(r, 0, 5);
        if (k === 0) return { text: `Read a book set in ${pick(r, places)}` };
        if (k === 1) return { text: `Read a book set in ${pick(r, SETTING_TYPES)}` };
        if (k === 2) return { text: `Read a book set in ${pick(r, ERAS)}` };
        if (k === 3) return { text: `Read a book that takes place during ${pick(r, SEASONS)}` };
        if (k === 4) return { text: `Read a book set in ${pick(r, SETTING_TYPES)} in ${pick(r, places)}` };
        return { text: `Read a book where the setting is ${pick(r, ['a place you have lived', 'a place you want to visit', 'a place you have visited', 'a place with a lot of snow', 'a place near water', 'a place that feels cozy'])}` };
      }
      case 'format': {
        const k = int(r, 0, 9);
        if (k <= 5) return { text: pick(r, written.format) };
        const t = pick(r, written.numbers);
        return { text: t.replace('{n}', String(pick(r, t.includes('under') ? [150, 200, 250, 300] : [400, 450, 500, 550]))).replace('{h}', String(pick(r, t.includes('under') ? [5, 6, 7, 8] : [10, 12, 14, 16]))).replace('{y}', String(pick(r, t.includes('before') ? [2018, 2020, 2022] : [2019, 2021, 2023, 2024, 2025, 2026]))) };
      }
      case 'playful': {
        const k = int(r, 0, 8);
        if (k === 0) return { text: `Read a book with a cover that is mostly ${pick(r, COLORS)}` };
        if (k === 1) return { text: `Read a book with ${pick(r, COVER_OBJECTS)} on the cover` };
        if (k === 2) return { text: `Read a book with the word "${pick(r, TITLE_WORDS)}" in the title` };
        if (k === 3) return { text: `Read a book with ${pick(r, TITLE_KINDS)}` };
        if (k === 4) return { text: `Read a book whose title starts with ${pick(r, LETTERS)}` };
        if (k === 5) return { text: `Read a book by an author whose ${pick(r, ['first', 'last'])} name starts with ${pick(r, LETTERS)}` };
        if (k === 6) return { text: `Read a book with a title that has ${pick(r, ['one', 'two', 'three', 'four', 'five'])} word${''}s`.replace('one words', 'one word') };
        return { text: pick(r, written.playful) };
      }
      case 'stretch': {
        const group = pick(r, ['ya', 'ya', 'scifi', 'scifi', 'mystery', 'mystery', 'other', 'other', 'other'] as const);
        return { text: pick(r, stretch[group]), note: 'A stretch space: step outside your usual' };
      }
      case 'reread': return { text: pick(r, written.reread), note: 'A reread space' };
      case 'challenge': {
        const c = x.challenge?.length ? pick(r, x.challenge) : null;
        return c ? { text: `${c.challenge}: ${c.label}`, note: `Also fits your ${c.challenge} challenge` } : null;
      }
      case 'yours': {
        const p = x.yours?.length ? pick(r, x.yours) : null;
        return p ? { text: p, note: 'From your own prompt list' } : null;
      }
    }
  };
  if (theme && themed[theme] && int(r, 0, 99) < 38) {
    const open = themed[theme].filter((t) => !used.has(t));
    if (open.length) return { text: pick(r, open) };
  }
  for (let i = 0; i < 30; i++) { const p = attempt(); if (!p) return null; if (!used.has(p.text)) return p; }
  return null;
}

export const makeBoss = (r: Rng, used: ReadonlySet<string>, x: Extras = {}): { title: string; text: string } => {
  const open = BOSSES.filter((b) => !used.has(b.text));
  if (open.length && int(r, 0, 99) < 55) return pick(r, open);
  const a = makePrompt(pick(r, ['trope', 'character'] as const), r, used, x)!.text.replace(/^Read a book (with|where|about|that)?\s?/i, '');
  const b = makePrompt(pick(r, ['setting', 'playful', 'format'] as const), r, used, x)!.text.replace(/^Read a book (with|where|about|that|set in|by)?\s?/i, '');
  return { title: pick(r, ['The Double Feature', 'The Mashup', 'The Crossover', 'The Remix']), text: `Boss: one book that fits both of these: "${a}" and "${b}"` };
};
export const makeQuest = (r: Rng): string => pick(r, QUESTS);
export const sampleQuests = (r: Rng, n: number) => shuffled(r, QUESTS).slice(0, n);
/** How many different prompts the list can make (a rough count, for fun). */
export function promptCapacity(x: Extras = {}): number {
  const t = TROPES.length + (x.tropes?.length ?? 0), j = OCCUPATIONS.length + (x.occupations?.length ?? 0), p = STATES.length + COUNTRIES.length + (x.places?.length ?? 0);
  return t * 3 + t * t / 2 + t * SEASONS.length + j + j * j / 2 + DYNAMICS.length + TRAITS.length + p + SETTING_TYPES.length * p + ERAS.length + SEASONS.length + written.format.length + 60 + COLORS.length + COVER_OBJECTS.length +
    TITLE_WORDS.length + TITLE_KINDS.length + LETTERS.length * 2 + written.playful.length + Object.values(stretch).flat().length + written.reread.length + Object.values(themed).flat().length + BOSSES.length + (x.challenge?.length ?? 0) + (x.yours?.length ?? 0);
}
