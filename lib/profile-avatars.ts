export type AvatarCharacter = {
  id: string;
  name: string;
  file: string;
};

export type AvatarCollection = {
  id: string;
  name: string;
  characters: AvatarCharacter[];
};

const collection = (
  id: string,
  name: string,
  values: Array<[id: string, name: string]>,
): AvatarCollection => ({
  id,
  name,
  characters: values.map(([characterId, characterName]) => ({
    id: `${id}-${characterId}`,
    name: characterName,
    file: `/assets/avatars/${id}/${characterId}.png`,
  })),
});

export const PROFILE_AVATAR_COLLECTIONS: AvatarCollection[] = [
  collection("simpsons", "Os Simpsons", [
    ["homer", "Homer Simpson"], ["marge", "Marge Simpson"],
    ["bart", "Bart Simpson"], ["lisa", "Lisa Simpson"],
    ["maggie", "Maggie Simpson"],
  ]),
  collection("family-guy", "Family Guy", [
    ["peter", "Peter Griffin"], ["lois", "Lois Griffin"],
    ["stewie", "Stewie Griffin"], ["brian", "Brian Griffin"],
  ]),
  collection("bob-esponja", "Bob Esponja", [
    ["bob", "Bob Esponja"], ["patrick", "Patrick Estrela"],
    ["lula", "Lula Molusco"], ["siriguejo", "Seu Siriguejo"],
    ["sandy", "Sandy Bochechas"],
  ]),
  collection("supernatural", "Supernatural", [
    ["sam", "Sam Winchester"], ["dean", "Dean Winchester"],
    ["castiel", "Castiel"],
  ]),
  collection("reacher", "Reacher", [["reacher", "Jack Reacher"]]),
  collection("scooby-doo", "Scooby-Doo", [
    ["scooby", "Scooby-Doo"], ["salsicha", "Salsicha"],
    ["velma", "Velma"], ["daphne", "Daphne"], ["fred", "Fred"],
  ]),
  collection("hora-de-aventura", "Hora de Aventura", [
    ["finn", "Finn"], ["jake", "Jake"], ["marceline", "Marceline"],
    ["jujuba", "Princesa Jujuba"],
  ]),
  collection("la-casa-de-papel", "La Casa de Papel", [
    ["professor", "Professor"], ["toquio", "Tóquio"],
    ["berlim", "Berlim"], ["rio", "Rio"], ["nairobi", "Nairobi"],
  ]),
  collection("harry-potter", "Harry Potter", [
    ["harry", "Harry Potter"], ["hermione", "Hermione Granger"],
    ["ron", "Ron Weasley"], ["voldemort", "Voldemort"],
  ]),
  collection("senhor-dos-aneis", "Senhor dos Anéis", [
    ["frodo", "Frodo"], ["sam", "Sam"], ["gandalf", "Gandalf"],
    ["aragorn", "Aragorn"], ["legolas", "Legolas"],
  ]),
  collection("shrek", "Shrek", [
    ["shrek", "Shrek"], ["burro", "Burro"], ["fiona", "Fiona"],
    ["gato", "Gato de Botas"],
  ]),
  collection("south-park", "South Park", [
    ["stan", "Stan"], ["kyle", "Kyle"], ["cartman", "Cartman"],
    ["kenny", "Kenny"],
  ]),
  collection("tom-e-jerry", "Tom e Jerry", [
    ["tom", "Tom"], ["jerry", "Jerry"],
  ]),
  collection("looney-tunes", "Looney Tunes", [
    ["pernalonga", "Pernalonga"], ["patolino", "Patolino"],
    ["taz", "Taz"], ["frajola", "Frajola"], ["piu-piu", "Piu-Piu"],
  ]),
  collection("breaking-bad", "Breaking Bad", [
    ["walter", "Walter White"], ["jesse", "Jesse Pinkman"],
    ["saul", "Saul Goodman"], ["gus", "Gus Fring"],
  ]),
  collection("brooklyn-nine-nine", "Brooklyn Nine-Nine", [
    ["jake", "Jake Peralta"], ["amy", "Amy Santiago"],
    ["holt", "Raymond Holt"], ["rosa", "Rosa Diaz"],
    ["terry", "Terry Jeffords"],
  ]),
  collection("vingadores", "Vingadores", [
    ["homem-de-ferro", "Homem de Ferro"],
    ["capitao-america", "Capitão América"], ["thor", "Thor"],
    ["hulk", "Hulk"], ["homem-aranha", "Homem-Aranha"],
  ]),
  collection("madagascar", "Madagascar", [
    ["alex", "Alex"], ["marty", "Marty"], ["gloria", "Gloria"],
    ["melman", "Melman"], ["rei-julien", "Rei Julien"],
  ]),
  collection("meu-malvado-favorito", "Meu Malvado Favorito", [
    ["gru", "Gru"], ["lucy", "Lucy"], ["margo", "Margo"],
    ["edith", "Edith"], ["agnes", "Agnes"],
    ["minions", "Stuart (Minions)"],
  ]),
];

export const PROFILE_AVATARS = PROFILE_AVATAR_COLLECTIONS.flatMap(
  (avatarCollection) => avatarCollection.characters.map((character) => ({
    ...character,
    collectionId: avatarCollection.id,
    collectionName: avatarCollection.name,
  })),
);

export function findProfileAvatar(id: string | null | undefined) {
  return PROFILE_AVATARS.find((avatar) => avatar.id === id) || null;
}

export function isValidProfileAvatar(id: string | null | undefined): id is string {
  return Boolean(findProfileAvatar(id));
}

export function profileAvatarUrl(id: string | null | undefined) {
  return findProfileAvatar(id)?.file || null;
}
