// Countries and the areas (states, provinces...) of the countries that have a fixed list.

export const COUNTRIES: string[] = ('Afghanistan|Albania|Algeria|Andorra|Angola|Antigua and Barbuda|Argentina|Armenia|Australia|Austria|Azerbaijan|Bahamas|Bahrain|Bangladesh|Barbados|Belarus|Belgium|Belize|Benin|Bhutan|Bolivia|Bosnia and Herzegovina|Botswana|Brazil|Brunei|Bulgaria|Burkina Faso|Burundi|Cabo Verde|Cambodia|Cameroon|Canada|Central African Republic|Chad|Chile|China|Colombia|Comoros|Congo|Costa Rica|Croatia|Cuba|Cyprus|Czechia|Democratic Republic of the Congo|Denmark|Djibouti|Dominica|Dominican Republic|Ecuador|Egypt|El Salvador|Equatorial Guinea|Eritrea|Estonia|Eswatini|Ethiopia|Fiji|Finland|France|Gabon|Gambia|Georgia|Germany|Ghana|Greece|Grenada|Guatemala|Guinea|Guinea-Bissau|Guyana|Haiti|Honduras|Hong Kong|Hungary|Iceland|India|Indonesia|Iran|Iraq|Ireland|Israel|Italy|Ivory Coast|Jamaica|Japan|Jordan|Kazakhstan|Kenya|Kiribati|Kosovo|Kuwait|Kyrgyzstan|Laos|Latvia|Lebanon|Lesotho|Liberia|Libya|Liechtenstein|Lithuania|Luxembourg|Madagascar|Malawi|Malaysia|Maldives|Mali|Malta|Marshall Islands|Mauritania|Mauritius|Mexico|Micronesia|Moldova|Monaco|Mongolia|Montenegro|Morocco|Mozambique|Myanmar|Namibia|Nauru|Nepal|Netherlands|New Zealand|Nicaragua|Niger|Nigeria|North Korea|North Macedonia|Norway|Oman|Pakistan|Palau|Palestine|Panama|Papua New Guinea|Paraguay|Peru|Philippines|Poland|Portugal|Qatar|Romania|Russia|Rwanda|Saint Kitts and Nevis|Saint Lucia|Saint Vincent and the Grenadines|Samoa|San Marino|Sao Tome and Principe|Saudi Arabia|Senegal|Serbia|Seychelles|Sierra Leone|Singapore|Slovakia|Slovenia|Solomon Islands|Somalia|South Africa|South Korea|South Sudan|Spain|Sri Lanka|Sudan|Suriname|Sweden|Switzerland|Syria|Taiwan|Tajikistan|Tanzania|Thailand|Timor-Leste|Togo|Tonga|Trinidad and Tobago|Tunisia|Turkey|Turkmenistan|Tuvalu|Uganda|Ukraine|United Arab Emirates|United Kingdom|United States|Uruguay|Uzbekistan|Vanuatu|Vatican City|Venezuela|Vietnam|Yemen|Zambia|Zimbabwe').split('|');

// The countries used most often come first in every list.
export const COMMON_COUNTRIES = ['United States', 'Canada', 'United Kingdom'];
export const COUNTRIES_ORDERED: string[] = [...COMMON_COUNTRIES, ...COUNTRIES.filter((c) => !COMMON_COUNTRIES.includes(c))];

const ALIASES: Record<string, string> = {
  usa: 'United States', us: 'United States', 'u s a': 'United States', 'u s': 'United States', 'united states of america': 'United States', america: 'United States',
  uk: 'United Kingdom', 'u k': 'United Kingdom', britain: 'United Kingdom', 'great britain': 'United Kingdom',
  holland: 'Netherlands', 'the netherlands': 'Netherlands', 'czech republic': 'Czechia', 'cote d ivoire': 'Ivory Coast', burma: 'Myanmar', 'republic of ireland': 'Ireland',
  'democratic republic of congo': 'Democratic Republic of the Congo', drc: 'Democratic Republic of the Congo', korea: 'South Korea', 'the bahamas': 'Bahamas', 'the gambia': 'Gambia', uae: 'United Arab Emirates', turkiye: 'Turkey',
};

export interface Area { name: string; abbr?: string }
const a = (list: string): Area[] => list.split('|').map((x) => { const [name, abbr] = x.split('='); return { name, abbr }; });
export const AREAS: Record<string, { label: string; list: Area[] }> = {
  'United States': { label: 'state', list: a('Alabama=AL|Alaska=AK|Arizona=AZ|Arkansas=AR|California=CA|Colorado=CO|Connecticut=CT|Delaware=DE|District of Columbia=DC|Florida=FL|Georgia=GA|Hawaii=HI|Idaho=ID|Illinois=IL|Indiana=IN|Iowa=IA|Kansas=KS|Kentucky=KY|Louisiana=LA|Maine=ME|Maryland=MD|Massachusetts=MA|Michigan=MI|Minnesota=MN|Mississippi=MS|Missouri=MO|Montana=MT|Nebraska=NE|Nevada=NV|New Hampshire=NH|New Jersey=NJ|New Mexico=NM|New York=NY|North Carolina=NC|North Dakota=ND|Ohio=OH|Oklahoma=OK|Oregon=OR|Pennsylvania=PA|Rhode Island=RI|South Carolina=SC|South Dakota=SD|Tennessee=TN|Texas=TX|Utah=UT|Vermont=VT|Virginia=VA|Washington=WA|West Virginia=WV|Wisconsin=WI|Wyoming=WY|Puerto Rico=PR|Guam=GU|U.S. Virgin Islands=VI|American Samoa=AS|Northern Mariana Islands=MP') },
  Canada: { label: 'province or territory', list: a('Alberta=AB|British Columbia=BC|Manitoba=MB|New Brunswick=NB|Newfoundland and Labrador=NL|Northwest Territories=NT|Nova Scotia=NS|Nunavut=NU|Ontario=ON|Prince Edward Island=PE|Quebec=QC|Saskatchewan=SK|Yukon=YT') },
  'United Kingdom': { label: 'nation', list: a('England|Scotland|Wales|Northern Ireland') },
  Australia: { label: 'state or territory', list: a('New South Wales=NSW|Victoria=VIC|Queensland=QLD|Western Australia=WA|South Australia=SA|Tasmania=TAS|Australian Capital Territory=ACT|Northern Territory=NT') },
  Mexico: { label: 'state', list: a('Aguascalientes|Baja California|Baja California Sur|Campeche|Chiapas|Chihuahua|Coahuila|Colima|Durango|Guanajuato|Guerrero|Hidalgo|Jalisco|State of Mexico|Mexico City|Michoacan|Morelos|Nayarit|Nuevo Leon|Oaxaca|Puebla|Queretaro|Quintana Roo|San Luis Potosi|Sinaloa|Sonora|Tabasco|Tamaulipas|Tlaxcala|Veracruz|Yucatan|Zacatecas') },
};
const ACCENTED: Record<string, string> = { Michoacan: 'Michoacán', 'Nuevo Leon': 'Nuevo León', Queretaro: 'Querétaro', 'San Luis Potosi': 'San Luis Potosí', Yucatan: 'Yucatán' };
export const areaDisplay = (name: string) => ACCENTED[name] ?? name;

export const norm = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const COUNTRY_KEYS = new Map<string, string>([...COUNTRIES.map((c) => [norm(c), c] as [string, string]), ...Object.entries(ALIASES)]);

// The country a text means ("usa" -> "United States"), or null if it is not one we know.
export const canonicalCountry = (t: string): string | null => COUNTRY_KEYS.get(norm(t)) ?? null;
export const hasAreaList = (country: string | null | undefined): boolean => !!country && !!AREAS[country];
export const areaLabel = (country: string | null | undefined): string => (country && AREAS[country]?.label) || 'area';
// The area of a country as written in its list ("wa" -> "Washington"), or null.
export function canonicalArea(country: string, t: string): string | null {
  const k = norm(t);
  const hit = AREAS[country]?.list.find((x) => norm(x.name) === k || (x.abbr && norm(x.abbr) === k.replace(/ /g, '')));
  return hit ? hit.name : null;
}

export interface Location { city?: string | null; area?: string | null; country?: string | null }
const clean = (v: string | null | undefined) => (v ?? '').trim().replace(/\s+/g, ' ');
// Search order for locations by which parts they have: country only, area only, city only, area + country, city + country, city + area, all three, then the rest.
export function locationRank(l: Location): number {
  const city = !!clean(l.city), area = !!clean(l.area), country = !!clean(l.country);
  if (country && !area && !city) return 0;
  if (area && !country && !city) return 1;
  if (city && !country && !area) return 2;
  if (area && country && !city) return 3;
  if (city && country && !area) return 4;
  if (city && area && !country) return 5;
  if (city && area && country) return 6;
  return 7;
}
// Keeps the order the list already has (A to Z) within each rank.
export const sortByLocation = <T extends Location>(list: T[]): T[] => list.map((x, i) => ({ x, i, r: locationRank(x) })).sort((a, b) => a.r - b.r || a.i - b.i).map((e) => e.x);
export const locationLabel = (l: Location): string => [clean(l.city), clean(l.area), clean(l.country)].filter(Boolean).join(', ');

// What is wrong with a location, if anything. Only an empty one is refused: every field accepts a custom value, and the lists are suggestions.
export function validateLocation(l: Location, _o: { fictional?: boolean; custom?: boolean } = {}): string | null { // eslint-disable-line @typescript-eslint/no-unused-vars
  if (!clean(l.city) && !clean(l.area) && !clean(l.country)) return 'Fill in a city, an area or a country.';
  return null;
}
// Notes about values that are not on the lists (they are kept as custom values).
export function customNotes(l: Location): { country?: string; area?: string } {
  const country = clean(l.country), area = clean(l.area);
  const c = country ? canonicalCountry(country) : null;
  const out: { country?: string; area?: string } = {};
  if (country && !c) out.country = `"${country}" is not on the country list, so it is saved as a custom country.`;
  if (area && c && hasAreaList(c) && !canonicalArea(c, area)) out.area = `"${area}" is not a ${areaLabel(c)} of ${c}, so it is saved as a custom area.`;
  return out;
}
// The same location written the standard way: the country by its proper name and the area as in its list.
export function standardLocation(l: Location, _o: { fictional?: boolean; custom?: boolean } = {}): { city: string | null; area: string | null; country: string | null } { // eslint-disable-line @typescript-eslint/no-unused-vars
  let city = clean(l.city) || null, area = clean(l.area) || null, country = clean(l.country) || null;
  if (country) country = canonicalCountry(country) ?? country;
  if (area && country && hasAreaList(country)) area = canonicalArea(country, area) ?? area;
  if (city === '') city = null;
  return { city, area, country };
}

// Reads an old plain-text location ("Seattle, WA", "Paris, France", "France"). Gives back null unless it is sure.
export function parseLocationText(text: string): { city: string | null; area: string | null; country: string | null } | null {
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > 3) return null;
  const areaHits = (t: string) => Object.keys(AREAS).flatMap((c) => { const n = canonicalArea(c, t); return n ? [{ country: c, name: n }] : []; });
  if (parts.length === 1) {
    const c = canonicalCountry(parts[0]);
    return c && areaHits(parts[0]).length === 0 ? { city: null, area: null, country: c } : null;
  }
  if (parts.length === 2) {
    const [x, y] = parts;
    const c = canonicalCountry(y), hits = areaHits(y);
    if (c && hits.length === 0) return hasAreaList(c) && canonicalArea(c, x) ? null : { city: x, area: null, country: c };
    // an abbreviation like WA or NT can be American, Canadian or Australian: the United States wins, then Canada
    const pick = hits.length === 1 ? hits[0] : hits.find((h) => h.country === 'United States') ?? hits.find((h) => h.country === 'Canada');
    if (!c && pick) return { city: x, area: pick.name, country: pick.country };
    return null;
  }
  const [city, area, countryText] = parts;
  const country = canonicalCountry(countryText);
  if (!country) return null;
  if (hasAreaList(country)) { const n = canonicalArea(country, area); return n ? { city, area: n, country } : null; }
  return { city, area, country };
}
