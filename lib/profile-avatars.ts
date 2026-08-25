export type AvatarCharacter = {
  id: string;
  name: string;
  page?: string;
  sourceUrl?: string;
  objectPosition?: string;
  backgroundSize?: string;
};

export type AvatarCollection = {
  id: string;
  name: string;
  wikiApi?: string;
  characters: AvatarCharacter[];
};

const characters = (collection: string, values: Array<[string, string]>) =>
  values.map(([id, name]) => ({ id: `${collection}-${id}`, name, page: name }));

export const PROFILE_AVATAR_COLLECTIONS: AvatarCollection[] = [
  {
    id: "simpsons", name: "Os Simpsons", wikiApi: "https://simpsons.fandom.com/api.php",
    characters: characters("simpsons", [["bart", "Bart Simpson"], ["lisa", "Lisa Simpson"], ["homer", "Homer Simpson"], ["marge", "Marge Simpson"], ["maggie", "Maggie Simpson"]]),
  },
  {
    id: "bob-esponja", name: "Bob Esponja", wikiApi: "https://spongebob.fandom.com/api.php",
    characters: [
      { id: "bob-esponja-bob", name: "Bob Esponja", page: "SpongeBob SquarePants (character)" },
      { id: "bob-esponja-patrick", name: "Patrick", page: "Patrick Star" },
      { id: "bob-esponja-lula", name: "Lula Molusco", page: "Squidward Tentacles" },
      { id: "bob-esponja-sandy", name: "Sandy", page: "Sandy Cheeks" },
      { id: "bob-esponja-siriguejo", name: "Seu Siriguejo", page: "Mr. Krabs" },
    ],
  },
  {
    id: "avatar", name: "Avatar: A Lenda de Aang", wikiApi: "https://avatar.fandom.com/api.php",
    characters: characters("avatar", [["aang", "Aang"], ["katara", "Katara"], ["sokka", "Sokka"], ["toph", "Toph Beifong"], ["zuko", "Zuko"]]),
  },
  {
    id: "pokemon", name: "Pokémon", wikiApi: "https://pokemon.fandom.com/api.php",
    characters: [
      { id: "pokemon-pikachu", name: "Pikachu", page: "Pikachu" },
      { id: "pokemon-ash", name: "Ash", page: "Ash Ketchum" },
      { id: "pokemon-misty", name: "Misty", page: "Misty (anime)" },
      { id: "pokemon-brock", name: "Brock", page: "Brock (anime)" },
      { id: "pokemon-meowth", name: "Meowth", page: "Meowth (Team Rocket)" },
    ],
  },
  {
    id: "naruto", name: "Naruto", wikiApi: "https://naruto.fandom.com/api.php",
    characters: characters("naruto", [["naruto", "Naruto Uzumaki"], ["sasuke", "Sasuke Uchiha"], ["sakura", "Sakura Haruno"], ["kakashi", "Kakashi Hatake"], ["gaara", "Gaara"]]),
  },
  {
    id: "dragon-ball", name: "Dragon Ball", wikiApi: "https://dragonball.fandom.com/api.php",
    characters: characters("dragon-ball", [["goku", "Goku"], ["vegeta", "Vegeta"], ["bulma", "Bulma"], ["piccolo", "Piccolo"], ["gohan", "Gohan"]]),
  },
  {
    id: "one-piece", name: "One Piece", wikiApi: "https://onepiece.fandom.com/api.php",
    characters: characters("one-piece", [["luffy", "Monkey D. Luffy"], ["zoro", "Roronoa Zoro"], ["nami", "Nami"], ["sanji", "Sanji"], ["chopper", "Tony Tony Chopper"]]),
  },
  {
    id: "scooby-doo", name: "Scooby-Doo", wikiApi: "https://scoobydoo.fandom.com/api.php",
    characters: [
      { id: "scooby-doo-scooby", name: "Scooby-Doo", page: "Scooby-Doo" },
      { id: "scooby-doo-salsicha", name: "Salsicha", page: "Shaggy Rogers" },
      { id: "scooby-doo-velma", name: "Velma", page: "Velma Dinkley" },
      { id: "scooby-doo-daphne", name: "Daphne", page: "Daphne Blake" },
      { id: "scooby-doo-fred", name: "Fred", page: "Fred Jones" },
    ],
  },
  {
    id: "looney-tunes", name: "Looney Tunes", wikiApi: "https://looneytunes.fandom.com/api.php",
    characters: [
      { id: "looney-tunes-pernalonga", name: "Pernalonga", page: "Bugs Bunny" },
      { id: "looney-tunes-patolino", name: "Patolino", page: "Daffy Duck" },
      { id: "looney-tunes-piu-piu", name: "Piu-Piu", page: "Tweety" },
      { id: "looney-tunes-frajola", name: "Frajola", page: "Sylvester the Cat" },
      { id: "looney-tunes-taz", name: "Taz", page: "Tasmanian Devil" },
    ],
  },
  {
    id: "tom-e-jerry", name: "Tom e Jerry", wikiApi: "https://tomandjerry.fandom.com/api.php",
    characters: [
      { id: "tom-e-jerry-tom", name: "Tom", page: "Tom Cat" },
      { id: "tom-e-jerry-jerry", name: "Jerry", page: "Jerry Mouse" },
      { id: "tom-e-jerry-spike", name: "Spike", page: "Spike Bulldog" },
      { id: "tom-e-jerry-tuffy", name: "Tuffy", page: "Tuffy" },
      { id: "tom-e-jerry-butch", name: "Butch", page: "Butch Cat" },
    ],
  },
  {
    id: "hora-de-aventura", name: "Hora de Aventura", wikiApi: "https://adventuretime.fandom.com/api.php",
    characters: [
      { id: "hora-de-aventura-finn", name: "Finn", page: "Finn" },
      { id: "hora-de-aventura-jake", name: "Jake", page: "Jake" },
      { id: "hora-de-aventura-jujuba", name: "Princesa Jujuba", page: "Princess Bubblegum" },
      { id: "hora-de-aventura-marceline", name: "Marceline", page: "Marceline" },
      { id: "hora-de-aventura-rei-gelado", name: "Rei Gelado", page: "Ice King" },
    ],
  },
  {
    id: "meninas-superpoderosas", name: "As Meninas Superpoderosas", wikiApi: "https://powerpuffgirls.fandom.com/api.php",
    characters: [
      { id: "meninas-superpoderosas-lindinha", name: "Lindinha", page: "Bubbles" },
      { id: "meninas-superpoderosas-florzinha", name: "Florzinha", page: "Blossom" },
      { id: "meninas-superpoderosas-docinho", name: "Docinho", page: "Buttercup" },
      { id: "meninas-superpoderosas-mojo", name: "Macaco Louco", page: "Mojo Jojo" },
      { id: "meninas-superpoderosas-professor", name: "Professor Utônio", page: "Professor Utonium" },
    ],
  },
  {
    id: "ben-10", name: "Ben 10", wikiApi: "https://ben10.fandom.com/api.php",
    characters: [
      { id: "ben-10-ben", name: "Ben", page: "Ben Tennyson (Classic)" },
      { id: "ben-10-gwen", name: "Gwen", page: "Gwen Tennyson (Classic)" },
      { id: "ben-10-kevin", name: "Kevin", page: "Kevin Levin (Classic)" },
      { id: "ben-10-max", name: "Vovô Max", page: "Max Tennyson (Classic)" },
      { id: "ben-10-chama", name: "Chama", page: "Heatblast" },
    ],
  },
  {
    id: "jovens-titas", name: "Jovens Titãs", wikiApi: "https://teentitans.fandom.com/api.php",
    characters: characters("jovens-titas", [["robin", "Robin"], ["estelar", "Starfire"], ["ravena", "Raven"], ["mutano", "Beast Boy"], ["ciborgue", "Cyborg"]]),
  },
  {
    id: "steven-universo", name: "Steven Universo", wikiApi: "https://steven-universe.fandom.com/api.php",
    characters: [
      { id: "steven-universo-steven", name: "Steven", page: "Steven Universe (character)" },
      { id: "steven-universo-garnet", name: "Garnet", page: "Garnet" },
      { id: "steven-universo-ametista", name: "Ametista", page: "Amethyst" },
      { id: "steven-universo-perola", name: "Pérola", page: "Pearl" },
      { id: "steven-universo-connie", name: "Connie", page: "Connie Maheswaran" },
    ],
  },
  {
    id: "rick-and-morty", name: "Rick and Morty", wikiApi: "https://rickandmorty.fandom.com/api.php",
    characters: characters("rick-and-morty", [["rick", "Rick Sanchez"], ["morty", "Morty Smith"], ["summer", "Summer Smith"], ["beth", "Beth Smith"], ["jerry", "Jerry Smith"]]),
  },
  {
    id: "futurama", name: "Futurama", wikiApi: "https://futurama.fandom.com/api.php",
    characters: [
      { id: "futurama-fry", name: "Fry", page: "Philip J. Fry" },
      { id: "futurama-leela", name: "Leela", page: "Turanga Leela" },
      { id: "futurama-bender", name: "Bender", page: "Bender Bending Rodríguez" },
      { id: "futurama-amy", name: "Amy", page: "Amy Wong" },
      { id: "futurama-zoidberg", name: "Zoidberg", page: "John A. Zoidberg" },
    ],
  },
  {
    id: "family-guy", name: "Family Guy", wikiApi: "https://familyguy.fandom.com/api.php",
    characters: characters("family-guy", [["peter", "Peter Griffin"], ["lois", "Lois Griffin"], ["stewie", "Stewie Griffin"], ["brian", "Brian Griffin"], ["meg", "Meg Griffin"]]),
  },
  {
    id: "south-park", name: "South Park", wikiApi: "https://southpark.fandom.com/api.php",
    characters: characters("south-park", [["stan", "Stan Marsh"], ["kyle", "Kyle Broflovski"], ["cartman", "Eric Cartman"], ["kenny", "Kenny McCormick"], ["butters", "Butters Stotch"]]),
  },
  {
    id: "gravity-falls", name: "Gravity Falls", wikiApi: "https://gravityfalls.fandom.com/api.php",
    characters: characters("gravity-falls", [["dipper", "Dipper Pines"], ["mabel", "Mabel Pines"], ["stan", "Stan Pines"], ["wendy", "Wendy Corduroy"], ["soos", "Soos Ramirez"]]),
  },
  {
    id: "phineas-e-ferb", name: "Phineas e Ferb", wikiApi: "https://phineasandferb.fandom.com/api.php",
    characters: [
      { id: "phineas-e-ferb-phineas", name: "Phineas", page: "Phineas Flynn" },
      { id: "phineas-e-ferb-ferb", name: "Ferb", page: "Ferb Fletcher" },
      { id: "phineas-e-ferb-candace", name: "Candace", page: "Candace Flynn" },
      { id: "phineas-e-ferb-perry", name: "Perry", page: "Perry the Platypus" },
      { id: "phineas-e-ferb-doof", name: "Dr. Doofenshmirtz", page: "Heinz Doofenshmirtz" },
    ],
  },
  {
    id: "turma-da-monica", name: "Turma da Mônica", wikiApi: "https://turmadamonica.fandom.com/pt-br/api.php",
    characters: characters("turma-da-monica", [["monica", "Mônica"], ["cebolinha", "Cebolinha"], ["cascao", "Cascão"], ["magali", "Magali"], ["chico-bento", "Chico Bento"]]),
  },
  {
    id: "irmao-do-jorel", name: "Irmão do Jorel",
    characters: [
      { id: "irmao-do-jorel-irmao", name: "Irmão do Jorel", sourceUrl: "https://irmaodojorel.com.br/wp-content/uploads/2023/10/GRUPO_IDJ_JUJU_LARA_02.webp", backgroundSize: "220%", objectPosition: "0% 3%" },
      { id: "irmao-do-jorel-jorel", name: "Jorel", sourceUrl: "https://irmaodojorel.com.br/wp-content/uploads/2023/08/GRUPO_FAMILIA_01.webp", backgroundSize: "650%", objectPosition: "82% 12%" },
      { id: "irmao-do-jorel-lara", name: "Lara", sourceUrl: "https://irmaodojorel.com.br/wp-content/uploads/2023/10/GRUPO_IDJ_JUJU_LARA_02.webp", backgroundSize: "220%", objectPosition: "100% 50%" },
      { id: "irmao-do-jorel-vovo-juju", name: "Vovó Juju", sourceUrl: "https://irmaodojorel.com.br/wp-content/uploads/2023/10/GRUPO_IDJ_JUJU_LARA_02.webp", backgroundSize: "220%", objectPosition: "52% 100%" },
      { id: "irmao-do-jorel-gesonel", name: "Gesonel", sourceUrl: "https://irmaodojorel.com.br/wp-content/uploads/2023/08/GRUPO_FAMILIA_01.webp", backgroundSize: "650%", objectPosition: "97% 18%" },
    ],
  },
  {
    id: "toy-story", name: "Toy Story", wikiApi: "https://pixar.fandom.com/api.php",
    characters: characters("toy-story", [["woody", "Woody"], ["buzz", "Buzz Lightyear"], ["jessie", "Jessie"], ["rex", "Rex"], ["bo-peep", "Bo Peep"]]),
  },
  {
    id: "shrek", name: "Shrek", wikiApi: "https://dreamworks.fandom.com/api.php",
    characters: [
      { id: "shrek-shrek", name: "Shrek", page: "Shrek" },
      { id: "shrek-fiona", name: "Fiona", page: "Fiona" },
      { id: "shrek-burro", name: "Burro", page: "Donkey" },
      { id: "shrek-gato", name: "Gato de Botas", page: "Puss in Boots" },
      { id: "shrek-biscoito", name: "Biscoito", page: "Gingy" },
    ],
  },
];

export const PROFILE_AVATARS = PROFILE_AVATAR_COLLECTIONS.flatMap((collection) =>
  collection.characters.map((character) => ({ ...character, collectionId: collection.id, collectionName: collection.name, wikiApi: collection.wikiApi })),
);

export function findProfileAvatar(id: string | null | undefined) {
  return PROFILE_AVATARS.find((avatar) => avatar.id === id) || null;
}

export function isValidProfileAvatar(id: string | null | undefined): id is string {
  return Boolean(findProfileAvatar(id));
}

export function profileAvatarUrl(id: string | null | undefined) {
  return isValidProfileAvatar(id) ? `/api/avatar?id=${encodeURIComponent(id)}` : null;
}
