export type CompetitorSeed = { name: string; domain: string; evidence: string };
export type ClientSeed = { id: string; name: string; market: string; country: 'CA' | 'US'; evidence: string; competitors: CompetitorSeed[] };

// Research candidates only. An advertiser must be confirmed against Foreplay before its ads are queried.
export const clientCatalog: ClientSeed[] = [
  { id: 'andshawarma', name: 'AndShawarma', market: 'Gaithersburg, Maryland', country: 'US', evidence: 'https://www.andshawarma.co/', competitors: [
    { name: "Naz’s Halal Food", domain: 'nazshalal.com', evidence: 'https://nazshalal.com/stores/nazs-halal-food-gaithersburg/' },
    { name: 'CAVA', domain: 'cava.com', evidence: 'https://cava.com/locations' },
    { name: 'Moby Dick House of Kabob', domain: 'mobyskabob.com', evidence: 'https://www.mobyskabob.com/' },
    { name: 'The Halal Guys', domain: 'thehalalguys.com', evidence: 'https://thehalalguys.com/locations/891a-rockville-pike-washington/' },
  ] },
  { id: 'mrakovic', name: 'Mrakovic', market: 'Etobicoke, Ontario', country: 'CA', evidence: 'https://www.mrakovic.com/pages/about-us', competitors: [
    { name: 'Royal Meats', domain: 'royalmeats.ca', evidence: 'https://www.royalmeats.ca/food' },
    { name: 'Mak European Delicatessens', domain: 'makdeli.com', evidence: 'https://www.makdeli.com/restaurant-ch8x' },
    { name: 'Mercator Euro Deli', domain: 'mercatortoronto.com', evidence: 'https://mercatortoronto.com/our-menu/' },
    { name: 'Bonimi', domain: 'bonimi.ca', evidence: 'https://www.bonimi.ca/about.html' },
  ] },
  { id: 'burgerbloc', name: 'BurgerBloc', market: 'Greater Toronto Area, Ontario', country: 'CA', evidence: 'https://burgerbloc.ca/about-us', competitors: [
    { name: 'Burger Factory', domain: 'burgerfactory.ca', evidence: 'https://burgerfactory.ca/our-location/' },
    { name: 'Gladiator Burger', domain: 'gladiatorburger.com', evidence: 'https://www.gladiatorburger.com/' },
    { name: 'Holy Chuck', domain: 'holychuck.ca', evidence: 'https://holychuck.ca/' },
    { name: "The Burger’s Priest", domain: 'theburgerspriest.com', evidence: 'https://www.theburgerspriest.com/en/locations/on/toronto' },
  ] },
  { id: 'tezmart', name: 'Tezmart', market: 'Greater Toronto Area, Ontario', country: 'CA', evidence: 'https://tezmart.ca/online-indian-grocery', competitors: [
    { name: 'Iqbal Foods', domain: 'iqbalfoods.ca', evidence: 'https://iqbalfoods.ca/about-us' },
    { name: 'GoDirect', domain: 'go-direct.app', evidence: 'https://www.go-direct.app/delivery/toronto' },
    { name: 'Fine India Grocers', domain: 'fineindia.ca', evidence: 'https://fineindia.ca/pages/about-us' },
    { name: 'Gokul Superstore', domain: 'gokulsuperstore.ca', evidence: 'https://www.gokulsuperstore.ca/' },
  ] },
  { id: 'taza-products', name: 'Taza Products', market: 'Canada · packaged South Asian food', country: 'CA', evidence: 'https://tazaproducts.com/', competitors: [
    { name: 'Deep Foods', domain: 'deepfoods.com', evidence: 'https://deepfoods.com/contact-us' },
    { name: 'Nanak Foods', domain: 'nanakfoods.com', evidence: 'https://nanakfoods.com/products/punjabisamosa-s2cna' },
    { name: 'Kawan Food', domain: 'kawanfood.com', evidence: 'https://kawanfood.com/brands/kawan/' },
    { name: 'Ashoka Foods', domain: 'ashokafoods.com', evidence: 'https://ashokafoods.com/collections/all' },
  ] },
  { id: 'victoria-harbor-cafe', name: 'Victoria Harbor Cafe', market: 'Times Square, New York', country: 'US', evidence: 'https://ny.eater.com/venue/1000545/victoria-harbor-cafe', competitors: [
    { name: 'Joys Cafe', domain: 'joyscafenyc.com', evidence: 'https://www.joyscafenyc.com/about-us' },
    { name: 'Kong Sihk Tong', domain: 'kongsihktong.com', evidence: 'https://kongsihktong.com/about-us' },
    { name: 'SING NYC', domain: 'singnyc.online', evidence: 'https://www.singnyc.online/' },
    { name: 'Cha Cha Tang', domain: 'chachatang.com', evidence: 'https://www.chachatang.com/' },
  ] },
  { id: 'mycravingz', name: 'MyCravingz', market: 'Manassas, Virginia', country: 'US', evidence: 'https://www.mycravingz.com/', competitors: [
    { name: 'Azizam Bakery', domain: 'azizambakery.com', evidence: 'https://azizambakery.com/' },
    { name: 'Fairfax Bakery', domain: 'fairfaxbakery.com', evidence: 'https://fairfaxbakery.com/order-online/' },
    { name: 'Moda Cafe', domain: 'modacafe.com', evidence: 'https://modacafe.com/moda-cafe-restaurant-in-chantilly-va/' },
    { name: 'East West Cafe', domain: 'eastwestcafes.com', evidence: 'https://eastwestcafes.com/' },
  ] },
];
