#!/usr/bin/env node
// Generates the tag taxonomy seed migrations from the structured data below,
// which is a direct transcription of the "FRAMES TAG TAXONOMY" spec PDF —
// not invented data. Emits three migration files referencing rows by slug
// (not hand-coordinated UUIDs), so the generated SQL stays diff-reviewable.
// Run: node scripts/generate-tag-seed.mjs
//
// Design: one row per spec section in `categories` below (-> tag_categories),
// each with a flat or two-level (manufacturer -> model/family/fixture) tag
// list. `implies` is intentionally NOT auto-derived for every gear item —
// see the header comment in the generated implies migration for why.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

// ============================================================================
// Section definitions. Each category: { id, section, name, tier, facet }.
// `tags` is either a flat array of names, or an array of
// { manufacturer, items: [names] } groups for two-level gear sections.
// ============================================================================
const CATEGORIES = [
  {
    id: "content_type", section: 1, name: "Content Type", tier: "primary", facet: "content_type",
    tags: ["Short Film","Feature Film","Documentary","Documentary Series","Sports Film","Sports Documentary","Music Video","Commercial","Branded Film","Experimental Film","Animation","Series","Episode","Interview","Live Performance","Concert","Comedy","Stand-Up","Educational","Tutorial","How-To","Video Essay","Travel Film","Adventure Film","News","Journalism","Behind the Scenes","Making Of","Creator Video","Gaming","Esports","Event","Personal Story","Visual Story","Art Film"],
  },
  {
    id: "fiction_genre", section: 2, name: "Fiction Genre", tier: "secondary", facet: "genre",
    tags: ["Action","Adventure","Comedy","Dark Comedy","Drama","Romance","Romantic Comedy","Thriller","Psychological Thriller","Horror","Psychological Horror","Mystery","Crime","Gangster","Noir","Neo-Noir","Science Fiction","Fantasy","Supernatural","Historical","Historical Drama","War","Western","Musical","Family","Coming of Age","Teen","Satire","Political","Social Drama","Experimental","Surreal","Dystopian","Post-Apocalyptic","Biographical","Anthology","Fan Film"],
  },
  {
    id: "documentary_genre", section: 3, name: "Documentary Genre", tier: "secondary", facet: "genre",
    tags: ["Nature","Wildlife","Conservation","Environment","Climate","Science","Technology","History","Biography","Culture","Society","Politics","Human Rights","True Crime","Investigative","Journalism","Travel","Adventure","Exploration","Expedition","Sport","Music","Art","Fashion","Architecture","Design","Food","Business","Economics","Entrepreneurship","Education","Philosophy","Psychology","Religion","Spirituality","Human Interest","Personal Story","Community","Observational","Portrait","Interview","Behind The Scenes","Educational","Environmental"],
  },
  {
    id: "sports", section: 4, name: "Sports", tier: "secondary", facet: "topic",
    tags: [
      // Team Sports
      "Football","Rugby","American Football","Basketball","Baseball","Cricket","Hockey","Field Hockey","Ice Hockey","Volleyball","Beach Volleyball","Handball","Netball","Water Polo","Lacrosse",
      // Racquet Sports
      "Tennis","Table Tennis","Badminton","Squash","Pickleball",
      // Combat Sports
      "Boxing","MMA","UFC","Kickboxing","Muay Thai","Wrestling","Judo","Brazilian Jiu-Jitsu","Karate","Taekwondo","Martial Arts",
      // Action & Adventure Sports
      "Surfing","Skateboarding","Snowboarding","Skiing","Mountain Biking","BMX","Climbing","Bouldering","Parkour","Motocross","Enduro","Downhill","Freeride","Kitesurfing","Windsurfing","Wakeboarding","Waterskiing","Kayaking","Canoeing","Rafting","Whitewater","Sailing","Diving","Freediving","Spearfishing","Fishing",
      // Athletics
      "Running","Marathon","Trail Running","Ultra Running","Athletics","Sprinting","Hurdles","High Jump","Long Jump","Pole Vault","Swimming","Gymnastics","Triathlon","Cycling","Road Cycling","Track Cycling",
      // Motorsport
      "Formula Racing","Formula 1","Rally","Rallycross","NASCAR","GT Racing","Endurance Racing","Karting","Supercross","Drift","Drag Racing","Motorcycle Racing",
      // Other
      "Golf","Horse Racing","Equestrian","Archery","Shooting Sports","Rowing","Weightlifting","CrossFit","Bodybuilding",
      // Sports Content
      "Match","Race","Competition","Highlights","Training","Technique","Athlete Profile","Sports Analysis","Commentary","Sports Documentary","Team Profile","Extreme Sports",
    ],
  },
  {
    id: "lifestyle_subject", section: 5, name: "Lifestyle & Subject", tier: "secondary", facet: "topic",
    tags: ["Travel","Adventure","Food","Cooking","Baking","Restaurants","Street Food","Coffee","Fashion","Beauty","Fitness","Wellness","Home","Architecture","Interior Design","Gardening","DIY","Cars","Motorcycles","Aviation","Boats","Sailing","Nature","Wildlife","Ocean","Mountains","Forest","Desert","Cities","Rural","Family","Relationships","Parenting","Work","Creativity","Entrepreneurship","Business","Technology","Science","Space","History","Art","Photography","Music","Film","Theatre","Dance","Design","Education","Philosophy","Psychology","Society","Environment","Sustainability"],
  },
  {
    id: "music", section: 6, name: "Music", tier: "secondary", facet: "topic",
    tags: [
      // Genres
      "Pop","Rock","Alternative","Indie","Punk","Metal","Hip-Hop","Rap","R&B","Soul","Funk","Jazz","Blues","Classical","Country","Folk","Electronic","House","Techno","Drum & Bass","Ambient","Reggae","Dancehall","Afrobeat","Amapiano","K-Pop","Latin","World Music","Experimental",
      // Music Content
      "Music Video","Live Music","Concert","Festival","Artist Profile","Music Documentary","Studio Session","Live Session","Performance","Behind The Scenes","DJ Set","Dance Performance","Ballet","Contemporary Dance","Theatre","Spoken Word","Poetry","Performance Art",
    ],
  },
  {
    id: "gaming", section: 7, name: "Gaming", tier: "secondary", facet: "topic",
    tags: ["Gaming","Gameplay","Esports","Competitive Gaming","Game Review","Game Documentary","Game Development","Game Design","Speedrunning","Retro Gaming","Walkthrough","Playthrough","Strategy","Multiplayer","Single Player","Simulation","RPG","FPS","Racing","Sports Games","Fighting Games","Strategy Games","Indie Games","Virtual Reality","Augmented Reality"],
  },
  {
    id: "technology_knowledge", section: 8, name: "Technology & Knowledge", tier: "secondary", facet: "topic",
    tags: ["Technology","Artificial Intelligence","Robotics","Engineering","Programming","Software","Hardware","Gadgets","Cameras","Filmmaking","Photography","Space","Astronomy","Physics","Chemistry","Biology","Medicine","Psychology","Philosophy","Economics","Finance","Business","History","Geography","Mathematics","Education","Science","Future Technology","Sustainability","Renewable Energy"],
  },
  {
    id: "mood_tone", section: 9, name: "Mood & Tone", tier: "secondary", facet: "mood",
    tags: ["Cinematic","Beautiful","Emotional","Inspiring","Uplifting","Feel Good","Heartwarming","Funny","Dark","Intense","Suspenseful","Mysterious","Relaxing","Peaceful","Meditative","Thought Provoking","Atmospheric","Dreamlike","Surreal","Nostalgic","Romantic","Gritty","Raw","Intimate","Epic","Energetic","Wholesome","Strange","Unsettling","Haunting","Hopeful","Melancholic","Serious","Playful","Fast Paced","Slow Paced","Minimalist","Immersive","Experimental"],
  },
  {
    id: "visual_style", section: 10, name: "Visual Style", tier: "secondary", facet: "mood",
    tags: ["Cinematic","Photorealistic","Stylized","Experimental","Abstract","Surreal","Minimalist","Maximalist","Documentary Style","Observational","Handheld","Static Camera","Long Take","One Take","Slow Motion","Time Lapse","Hyperlapse","Stop Motion","Animation","Black And White","Monochrome","Vintage","Retro","Film Look","Digital Look","High Contrast","Low Contrast","Soft","Dreamlike","Gritty","Naturalistic","Stylized Colour","Desaturated","Highly Saturated"],
  },
];

// Location is hierarchical: continents (top), then example countries/
// regions/cities/specific-locations from the spec, nested via `children`.
const LOCATION = {
  id: "location", section: 11, name: "Location", tier: "secondary", facet: "location",
  tree: [
    { name: "Africa", children: [
      { name: "South Africa", children: [
        { name: "Western Cape", children: [{ name: "Cape Town" }] },
        { name: "Johannesburg" },
        { name: "Durban" },
        { name: "Kruger National Park" },
      ]},
    ]},
    { name: "Asia", children: [
      { name: "Thailand", children: [{ name: "Bangkok" }, { name: "Phuket" }, { name: "Koh Tao" }] },
      { name: "Japan", children: [{ name: "Tokyo" }] },
    ]},
    { name: "Europe", children: [
      { name: "United Kingdom", children: [{ name: "London" }] },
      { name: "France", children: [{ name: "Paris" }] },
    ]},
    { name: "North America", children: [
      { name: "United States", children: [
        { name: "California", children: [{ name: "Los Angeles" }] },
        { name: "New York" },
      ]},
    ]},
    { name: "South America", children: [] },
    { name: "Oceania", children: [
      { name: "Australia", children: [{ name: "Sydney" }] },
    ]},
    { name: "Antarctica", children: [] },
  ],
};

// Gear: manufacturer -> model/family/fixture two-level groups, plus flat
// type/technique/technology categories. Every group's `manufacturer` key
// becomes its own tag too (parent of each item in `items`).
const GEAR_GROUPED = [
  {
    id: "camera_model", section: 13, name: "Camera System", tier: "technical", facet: "gear",
    manufacturerCategory: "camera_manufacturer",
    groups: [
      { manufacturer: "ARRI", items: ["ARRI Alexa 35","ARRI Alexa 35 Xtreme","ARRI Alexa Mini","ARRI Alexa Mini LF","ARRI Alexa LF","ARRI Alexa 65","ARRI Alexa 265","ARRI Amira","ARRI Alexa XT","ARRI Alexa SXT","ARRI Alexa Classic","ARRI Alexa 4K","ARRI ALEXA 35 Live"] },
      { manufacturer: "RED", items: ["RED V-RAPTOR","RED V-RAPTOR XL","RED V-RAPTOR XL [X]","RED KOMODO","RED KOMODO-X","RED MONSTRO","RED V-RAPTOR 8K","RED V-RAPTOR 6K","RED WEAPON","RED EPIC-W","RED HELIUM","RED GEMINI","RED DRAGON"] },
      { manufacturer: "Sony", items: ["Sony VENICE","Sony VENICE 2","Sony BURANO","Sony FX9","Sony FX6","Sony FX3","Sony FX2","Sony FX30","Sony FX5","Sony FX3A","Sony A1","Sony A7S III","Sony A7 IV","Sony A7R V","Sony A7C II","Sony A9 III"] },
      { manufacturer: "Canon", items: ["Canon C400","Canon C500 Mark II","Canon C300 Mark III","Canon C80","Canon C70","Canon C300 Mark II","Canon C200","Canon C100","Canon EOS R5 C","Canon EOS R5","Canon EOS R6 Mark II","Canon EOS R1","Canon EOS R3","Canon EOS R7"] },
      { manufacturer: "Blackmagic Design", items: ["Blackmagic URSA Cine 12K","Blackmagic URSA Cine 17K","Blackmagic URSA Mini Pro 12K","Blackmagic URSA Mini Pro 4.6K","Blackmagic Pocket Cinema Camera 6K","Blackmagic Pocket Cinema Camera 6K Pro","Blackmagic Pocket Cinema Camera 4K","Blackmagic Cinema Camera 6K","Blackmagic Cinema Camera 4K","Blackmagic PYXIS 6K","Blackmagic PYXIS 12K","Blackmagic Micro Studio Camera","Blackmagic Studio Camera"] },
      { manufacturer: "Panasonic", items: ["Panasonic Varicam","Panasonic EVA1","Panasonic GH6","Panasonic GH7","Panasonic S1H","Panasonic S5IIX","Panasonic S5II","Panasonic S1R"] },
      { manufacturer: "Fujifilm", items: ["Fujifilm GFX100 II","Fujifilm GFX100S II","Fujifilm X-H2S","Fujifilm X-H2","Fujifilm X-T5","Fujifilm X-S20"] },
      { manufacturer: "Nikon", items: ["Nikon Z9","Nikon Z8","Nikon Z6 III","Nikon Zf","Nikon Z6 II","Nikon Z7 II"] },
      { manufacturer: "Leica", items: ["Leica SL3","Leica SL2-S","Leica Q3","Leica Q3 43","Leica M11","Leica M11 Monochrom"] },
      { manufacturer: "Z CAM", items: ["Z CAM E2-F6","Z CAM E2-F8","Z CAM E2-S6","Z CAM E2-M4"] },
      { manufacturer: "Kinefinity", items: ["Kinefinity MAVO Edge 6K","Kinefinity MAVO Edge 8K","Kinefinity MAVO S35","Kinefinity MAVO LF"] },
      { manufacturer: "DJI", items: ["DJI Ronin 4D","DJI Osmo Pocket","DJI Osmo Action"] },
      { manufacturer: "GoPro", items: ["GoPro HERO","GoPro HERO Black","GoPro MAX"] },
      { manufacturer: "Insta360", items: ["Insta360 X Series","Insta360 Ace Pro","Insta360 GO"] },
      { manufacturer: "Apple", items: ["iPhone","iPhone Pro","iPhone Pro Max"] },
      { manufacturer: "Google", items: ["Google Pixel"] },
      { manufacturer: "Samsung", items: ["Samsung Galaxy"] },
    ],
    extraFlat: ["Smartphone"],
  },
  {
    id: "lens_family", section: 15, name: "Cinema Lens Families", tier: "technical", facet: "gear",
    manufacturerCategory: "lens_manufacturer",
    groups: [
      { manufacturer: "ARRI", items: ["ARRI Signature Prime","ARRI Signature Zoom","ARRI Master Prime","ARRI Ultra Prime","ARRI DNA LF","ARRI DNA","ARRI Zeiss Ultra Prime"] },
      { manufacturer: "Zeiss", items: ["Zeiss Supreme Prime","Zeiss Supreme Prime Radiance","Zeiss CP.3","Zeiss CP.2","Zeiss Master Prime","Zeiss Compact Prime"] },
      { manufacturer: "Cooke", items: ["Cooke S8/i","Cooke S7/i","Cooke S4/i","Cooke Panchro","Cooke Speed Panchro","Cooke Anamorphic/i","Cooke Varotal"] },
      { manufacturer: "Leica", items: ["Leica Summilux-C","Leica Summicron-C","Leica Thalia","Leica R"] },
      { manufacturer: "Angenieux", items: ["Angenieux Optimo","Angenieux EZ"] },
      { manufacturer: "Canon", items: ["Canon CN-E","Canon Sumire Prime","Canon K35","Canon RF Cinema"] },
      { manufacturer: "Sigma", items: ["Sigma Cine","Sigma FF High Speed Prime"] },
      { manufacturer: "Atlas Lens Co", items: ["Atlas Orion","Atlas Mercury","Atlas Lens Orion Anamorphic"] },
      { manufacturer: "Laowa", items: ["Laowa Probe","Laowa Nanomorph"] },
      { manufacturer: "DZOFilm", items: ["DZOFilm Vespid","DZOFilm Pictor","DZOFilm Arles"] },
      { manufacturer: "Sirui", items: ["Sirui Saturn","Sirui Night Walker"] },
      { manufacturer: "Samyang", items: ["Samyang XEEN"] },
      { manufacturer: "Rokinon", items: ["Rokinon Cine"] },
    ],
  },
  {
    id: "lighting_fixture", section: 16, name: "Specific Lighting Systems", tier: "technical", facet: "gear",
    manufacturerCategory: "lighting_manufacturer",
    groups: [
      { manufacturer: "ARRI", items: ["ARRI SkyPanel S60","ARRI SkyPanel S120","ARRI SkyPanel S360","ARRI Orbiter","ARRI L7-C","ARRI M18","ARRI M40","ARRI M90","ARRI M-Series"] },
      { manufacturer: "Aputure", items: ["Aputure 600D Pro","Aputure 600X Pro","Aputure 1200D Pro","Aputure 1200X","Aputure 300D II","Aputure 300X","Aputure 600C Pro","Aputure LS 60D","Aputure LS 60X","Aputure INFINIMAT","Aputure Nova P300C","Aputure Nova P600C","Aputure Electro Storm CS15","Aputure Electro Storm XT26"] },
      { manufacturer: "amaran", items: ["amaran 60d","amaran 60x","amaran 100d","amaran 100x","amaran 200d","amaran 200x","amaran 300c","amaran 150c","amaran P60c","amaran P60x","amaran F22c","amaran F21c","amaran PT2c","amaran PT4c"] },
      { manufacturer: "Astera", items: ["Astera Titan Tube","Astera Helios Tube","Astera Hyperion Tube","Astera AX1","Astera AX2","Astera AX3","Astera AX5","Astera AX9","Astera AX10","Astera NYX Bulb","Astera LunaBulb"] },
      { manufacturer: "Nanlite", items: ["Nanlite Forza 60","Nanlite Forza 60B","Nanlite Forza 150","Nanlite Forza 300","Nanlite Forza 300B","Nanlite Forza 500","Nanlite Forza 500B","Nanlite Forza 720","Nanlite PavoTube","Nanlite MixPanel","Nanlite Evoke"] },
      { manufacturer: "Godox", items: ["Godox SL60","Godox SL150","Godox SL200","Godox M600","Godox KNOWLED M600D","Godox KNOWLED M1200D","Godox KNOWLED F400Bi","Godox KNOWLED MG1200Bi","Godox KNOWLED P600Bi"] },
      { manufacturer: "Kino Flo", items: ["Kino Flo Diva-Lite","Kino Flo FreeStyle","Kino Flo Celeb","Kino Flo Select","Kino Flo LED"] },
    ],
  },
  {
    id: "microphone_model", section: 18, name: "Specific Microphones", tier: "technical", facet: "gear",
    manufacturerCategory: "audio_manufacturer",
    groups: [
      { manufacturer: "Sennheiser", items: ["Sennheiser MKH 416","Sennheiser MKH 418","Sennheiser MKH 50","Sennheiser MKH 60","Sennheiser MKH 70","Sennheiser MKH 8060"] },
      { manufacturer: "Schoeps", items: ["Schoeps CMC6","Schoeps CMC1","Schoeps CMIT 5U"] },
      { manufacturer: "DPA", items: ["DPA 4017","DPA 4017B","DPA 6060","DPA 4060"] },
      { manufacturer: "RØDE", items: ["RØDE NTG3","RØDE NTG5","RØDE VideoMic","RØDE Wireless PRO","RØDE Wireless GO"] },
      { manufacturer: "Deity", items: ["Deity S-Mic 2","Deity Theos","Deity W.Lav"] },
      { manufacturer: "Shure", items: ["Shure SM58","Shure SM7B","Shure VP89"] },
      { manufacturer: "Audio-Technica", items: ["Audio-Technica AT4053b","Audio-Technica BP4029"] },
      { manufacturer: "Neumann", items: ["Neumann U87","Neumann KM 84"] },
      { manufacturer: "Sony", items: ["Sony ECM Series"] },
    ],
  },
  {
    id: "audio_recorder", section: 19, name: "Audio Recorders", tier: "technical", facet: "gear",
    manufacturerCategory: "audio_recorder_manufacturer",
    groups: [
      { manufacturer: "Sound Devices", items: ["Sound Devices 833","Sound Devices 888","Sound Devices Scorpio","Sound Devices MixPre-3 II","Sound Devices MixPre-6 II","Sound Devices MixPre-10 II","Sound Devices A20"] },
      { manufacturer: "Zoom", items: ["Zoom F2","Zoom F3","Zoom F6","Zoom F8n","Zoom F8n Pro","Zoom F4","Zoom H4n","Zoom H5","Zoom H6"] },
    ],
  },
  {
    id: "wireless_audio_system", section: 19, name: "Wireless Audio", tier: "technical", facet: "gear",
    manufacturerCategory: "wireless_audio_manufacturer",
    groups: [
      { manufacturer: "Lectrosonics", items: ["Lectrosonics"] },
      { manufacturer: "Wisycom", items: ["Wisycom"] },
      { manufacturer: "Sennheiser", items: ["Sennheiser EW-D","Sennheiser AVX","Sennheiser Digital 6000"] },
      { manufacturer: "RØDE", items: ["RØDE Wireless GO","RØDE Wireless PRO"] },
      { manufacturer: "DJI", items: ["DJI Mic","DJI Mic 2"] },
      { manufacturer: "Deity", items: ["Deity Theos"] },
      { manufacturer: "Hollyland", items: ["Hollyland Lark"] },
      { manufacturer: "Sony", items: ["Sony UWP"] },
    ],
  },
  {
    id: "drone_model", section: 22, name: "Drones", tier: "technical", facet: "gear",
    manufacturerCategory: "drone_manufacturer",
    groups: [
      { manufacturer: "DJI", items: ["DJI Mavic","DJI Mavic 3","DJI Mavic 3 Pro","DJI Mavic 4 Pro","DJI Air","DJI Mini","DJI Inspire 2","DJI Inspire 3","DJI Avata","DJI Avata 2","DJI FPV"] },
      { manufacturer: "Autel", items: ["Autel"] },
      { manufacturer: "Freefly", items: ["Freefly"] },
      { manufacturer: "Skydio", items: ["Skydio"] },
    ],
  },
  {
    id: "monitoring_product", section: 25, name: "Specific Monitoring", tier: "technical", facet: "gear",
    manufacturerCategory: "monitoring_manufacturer",
    groups: [
      { manufacturer: "Atomos", items: ["Atomos Ninja","Atomos Shogun"] },
      { manufacturer: "Blackmagic Design", items: ["Blackmagic Video Assist 5","Blackmagic Video Assist 7"] },
      { manufacturer: "SmallHD", items: ["SmallHD Cine","SmallHD Indie","SmallHD Ultra"] },
      { manufacturer: "Teradek", items: ["Teradek Bolt"] },
      { manufacturer: "DJI", items: ["DJI Transmission"] },
      { manufacturer: "Hollyland", items: ["Hollyland Mars","Hollyland Pyro"] },
    ],
  },
  {
    id: "film_stock", section: 24, name: "Film Stock", tier: "technical", facet: "gear",
    manufacturerCategory: "film_stock_manufacturer",
    groups: [
      { manufacturer: "Kodak", items: ["Kodak Vision3 50D","Kodak Vision3 250D","Kodak Vision3 500T","Kodak Ektachrome","Kodak Tri-X","Kodak Portra"] },
      { manufacturer: "Fujifilm", items: ["Fujifilm Eterna","Fujifilm Pro 400H","Fujifilm Velvia","Fujifilm Provia"] },
      { manufacturer: "Cinestill", items: ["Cinestill"] },
      { manufacturer: "Ilford", items: ["Ilford"] },
    ],
    extraFlat: ["Black And White Film","Colour Negative","Colour Positive","Reversal Film"],
  },
];

// Flat gear categories (no manufacturer grouping).
const GEAR_FLAT = [
  { id: "recording_format", section: 14, name: "Camera Recording Format", tags: ["ARRIRAW","Apple ProRes RAW","ProRes 4444","ProRes 422 HQ","ProRes 422","ProRes LT","REDCODE RAW","BRAW","CinemaDNG","X-OCN","XAVC","DNxHD","DNxHR","H.264","H.265","RAW","Log","HDR","SDR"] },
  { id: "lens_manufacturer", section: 15, name: "Lens Manufacturers", tags: ["ARRI","Cooke","Zeiss","Leica","Angenieux","Canon","Sony","Sigma","Fujifilm","Nikon","Atlas Lens Co","Laowa","DZOFilm","Samyang","Rokinon","Tokina","Tamron","Sirui","Viltrox"] },
  { id: "lens_type", section: 15, name: "Lens Type", tags: ["Prime","Zoom","Anamorphic","Spherical","Vintage","Cinema Lens","Photo Lens","Macro","Probe","Tilt Shift","Fisheye","Wide Angle","Ultra Wide","Telephoto","Super Telephoto","Pancake","Specialty Lens"] },
  { id: "lens_characteristic", section: 15, name: "Lens Characteristics", tags: ["Anamorphic","Spherical","Vintage","Modern","Soft","Clinical","High Contrast","Low Contrast","Flare","Oval Bokeh","Swirly Bokeh","Shallow Depth Of Field","Deep Focus","Lens Distortion","Macro","Probe","Fisheye"] },
  { id: "lighting_manufacturer", section: 16, name: "Lighting Manufacturers", tags: ["ARRI","Aputure","amaran","Astera","Nanlite","Godox","Litepanels","Kino Flo","Creamsource","Dedolight","Quasar Science","ETC","Rosco","Prolycht"] },
  { id: "lighting_technology", section: 16, name: "Lighting Technology", tags: ["LED","RGB","RGBWW","Bi-Color","Daylight","Tungsten","HMI","Fluorescent","COB","Panel","Tube","Fresnel","Point Source","Practical","Battery Powered","Wireless Lighting"] },
  { id: "lighting_technique", section: 16, name: "Lighting Technique", tags: ["Three Point Lighting","Key Light","Fill Light","Backlight","Rim Light","Hair Light","Hard Light","Soft Light","Bounce","Negative Fill","Motivated Light","Natural Light","Available Light","Practical Lighting","Silhouette","Chiaroscuro","Rembrandt Lighting","Low Key","High Key","Mixed Lighting","Golden Hour","Blue Hour","Night Lighting","Candlelight"] },
  { id: "light_modifier", section: 17, name: "Modifiers & Light Control", tags: ["Softbox","Octabox","Stripbox","Lantern","Beauty Dish","Fresnel","Reflector","Grid","Snoot","Barn Doors","Flags","Cutter","Scrim","Diffusion","Bounce","Negative Fill","Silks","Frames","Butterfly","Overhead","Book Light","Eggcrate","China Ball","Practical","Mirror","Projection Attachment","Spotlight Attachment","Gobo","Cucoloris"] },
  { id: "diffusion_filter", section: 17, name: "Diffusion", tags: ["1/8 Black Pro-Mist","1/4 Black Pro-Mist","1/2 Black Pro-Mist","1 Black Pro-Mist","Glimmerglass","Hollywood Black Magic","Classic Soft","Soft FX","Pearlescent","White Diffusion","Opal","Grid Cloth","Full Grid","Half Grid","Quarter Grid","Silk","Frost"] },
  { id: "audio_manufacturer", section: 18, name: "Microphone Manufacturers", tags: ["Sennheiser","Schoeps","DPA","RØDE","Shure","Deity","Audio-Technica","Neumann","Sony","Electro-Voice","AKG","Rycote"] },
  { id: "microphone_type", section: 18, name: "Microphone Type", tags: ["Shotgun","Supercardioid","Cardioid","Omnidirectional","Lavalier","Wireless Lavalier","Boom","Handheld","Condenser","Dynamic","Stereo","Mid-Side","Boundary","Contact Microphone","Ambisonic"] },
  { id: "camera_support", section: 20, name: "Camera Support", tags: ["Tripod","Monopod","Shoulder Rig","Shoulder Mount","Cage","Baseplate","Easyrig","Handheld Rig","Top Handle","Side Handle","Gimbal","Steadicam","Dolly","Slider","Jib","Crane","Car Rig","Suction Mount","Helmet Mount","Chest Mount","Body Mount","Snorricam","Underwater Housing"] },
  { id: "camera_movement", section: 21, name: "Camera Movement", tags: ["Static","Handheld","Tripod","Pan","Tilt","Push In","Pull Out","Tracking","Dolly","Slider","Crane","Jib","Orbit","Arc","Whip Pan","Roll","Dutch Angle","Zoom","Crash Zoom","Steadicam","Gimbal","Drone","FPV","Vehicle Mount","Long Take","One Take","POV"] },
  { id: "drone_manufacturer", section: 22, name: "Drone Manufacturers", tags: ["DJI","Autel","Freefly","Skydio"] },
  { id: "drone_type", section: 22, name: "Drone Type", tags: ["Cinema Drone","FPV Drone","Camera Drone","Racing Drone","Micro Drone","Aerial Photography","Aerial Cinematography"] },
  { id: "filter", section: 23, name: "Filters", tags: ["ND","Variable ND","Polarizer","Circular Polarizer","UV","IR","Diffusion","Black Pro-Mist","Glimmerglass","Hollywood Black Magic","Soft FX","Classic Soft","Pearlescent","Star Filter","Diopter","Close-Up Filter","Anamorphic Filter","Streak Filter","Lens Flare Filter"] },
  { id: "film_gauge", section: 24, name: "Film Gauge", tags: ["Super 8","8mm","16mm","Super 16","35mm","Super 35","65mm","70mm","IMAX"] },
  { id: "monitoring", section: 25, name: "Monitoring", tags: ["On-Camera Monitor","Director Monitor","Wireless Video","Video Village","EVF","Optical Viewfinder","ARRI MVF","SmallHD","Atomos","Blackmagic Video Assist","Teradek","DJI Transmission","Hollyland","Vaxis"] },
  { id: "editing_software", section: 26, name: "Editing Software", tags: ["DaVinci Resolve","Adobe Premiere Pro","Final Cut Pro","Avid Media Composer","Media Composer","Vegas Pro","CapCut","iMovie"] },
  { id: "colour_software", section: 26, name: "Colour", tags: ["DaVinci Resolve","Baselight","FilmLight","Colour Grading","Colour Correction","Film Emulation","LUT","ACES","HDR","SDR","Rec.709","Rec.2020","Log","RAW","Dolby Vision"] },
  { id: "vfx_software", section: 26, name: "VFX", tags: ["After Effects","Nuke","Fusion","Blender","Houdini","Cinema 4D","Maya","3D","CGI","Compositing","Motion Graphics","Green Screen","Blue Screen","Virtual Production","Motion Capture","Practical Effects","Miniatures","Stop Motion"] },
  { id: "audio_post_software", section: 26, name: "Audio Post", tags: ["Pro Tools","Logic Pro","Fairlight","Adobe Audition","Sound Design","Mixing","Mastering","Foley","ADR","Voiceover","Spatial Audio","Dolby Atmos","Stereo","Surround"] },
  { id: "specialty_capture", section: 27, name: "Specialty Capture", tags: ["Underwater","Underwater Housing","Waterproof Camera","High Speed Camera","Slow Motion","Time Lapse","Hyperlapse","Motion Control","Macro","Probe Lens","Thermal","Infrared","Night Vision","360 Camera","VR","Volumetric Capture","Motion Capture","Green Screen","Blue Screen","Virtual Production","LED Volume","Stop Motion","Miniature","Tilt Shift"] },
  { id: "production_design", section: 28, name: "Production Design", tags: ["Production Design","Set Design","Art Direction","Props","Costume Design","Wardrobe","Makeup","Hair","Practical Effects","Miniatures","Model Making","Set Construction","Location Design","Scenic Design","Practical Lighting","Period Design","Contemporary Design","Futuristic Design"] },
  { id: "editing_technique", section: 29, name: "Editing & Storytelling Techniques", tags: ["Long Take","One Take","Montage","Parallel Editing","Cross Cutting","Match Cut","Jump Cut","Invisible Cut","Smash Cut","Whip Cut","Slow Motion","Time Lapse","Freeze Frame","Split Screen","POV","Voiceover","Interview","Archival Footage","Found Footage","Reenactment","Non Linear","Linear","Experimental Editing"] },
  { id: "craft", section: 30, name: "Creator / Craft", tags: ["Directing","Cinematography","Screenwriting","Producing","Editing","Colour Grading","Sound Design","Production Design","Art Direction","Costume Design","Makeup","Hair","Visual Effects","Animation","Motion Graphics","Photography","Camera Operating","Steadicam Operating","Drone Operating","Focus Pulling","Gaffing","Grip","Location Sound","Foley","ADR","Compositing","Set Design"] },
];

// Gear inheritance — deliberately NOT auto-derived for every one of the
// ~250 gear items above: precise mount/sensor-format/camera-class claims
// for every individual model would be fabricated confidence for anything
// beyond what's explicitly given. Populated here:
//  (a) every gear item -> its own manufacturer tag (fully mechanical, always
//      correct by construction — the spec's own grouping *is* this fact),
//      generated programmatically below from GEAR_GROUPED, not listed here.
//  (b) the two full inheritance chains the spec gives verbatim as examples.
// Extending (b) to more models is future work requiring real per-model
// product data, not something to guess at.
const EXPLICIT_IMPLIES = [
  { from: "Sony FX3", to: ["Sony", "Cinema Camera", "Mirrorless Cinema Camera", "Full Frame", "Sony E-Mount"] },
  { from: "ARRI Alexa 35", to: ["ARRI", "Cinema Camera", "Super 35", "Digital Cinema", "ARRI PL Mount"] },
];
// Supporting tags for the chains above that don't already exist elsewhere.
const IMPLIES_SUPPORT_TAGS = {
  gear_class: ["Cinema Camera", "Mirrorless Cinema Camera", "Digital Cinema"],
  gear_sensor_format: ["Full Frame", "Super 35"],
  gear_mount: ["Sony E-Mount", "ARRI PL Mount"],
};

// ============================================================================
// Emit
// ============================================================================
const contentLines = [];
const gearLines = [];
const impliesLines = [];
const seenSlugs = new Map(); // categoryId -> Set(slug), for within-category de-dup

function addTagCategoryRow(lines, { id, section, name, tier, facet }) {
  lines.push(
    `insert into tag_categories (id, section_number, name, tier, facet) values (${sqlLiteral(id)}, ${section}, ${sqlLiteral(name)}, ${sqlLiteral(tier)}, ${sqlLiteral(facet)}) on conflict (id) do nothing;`
  );
}

function addTagRow(lines, categoryId, name, { manufacturer = null, parentSlug = null } = {}) {
  if (!seenSlugs.has(categoryId)) seenSlugs.set(categoryId, new Set());
  const slug = slugify(name);
  const seen = seenSlugs.get(categoryId);
  if (seen.has(slug)) return slug; // dedupe within category, still return slug for parent refs
  seen.add(slug);
  const parentExpr = parentSlug
    ? `(select id from tags where category_id = ${sqlLiteral(categoryId)} and slug = ${sqlLiteral(slugify(parentSlug))})`
    : "null";
  lines.push(
    `insert into tags (category_id, parent_tag_id, name, slug, manufacturer) values (${sqlLiteral(categoryId)}, ${parentExpr}, ${sqlLiteral(name)}, ${sqlLiteral(slug)}, ${sqlLiteral(manufacturer)}) on conflict (category_id, slug) do nothing;`
  );
  return slug;
}

// --- content sections (flat) ---
for (const cat of CATEGORIES) {
  addTagCategoryRow(contentLines, cat);
  for (const name of cat.tags) addTagRow(contentLines, cat.id, name);
}

// --- location (hierarchical tree) ---
addTagCategoryRow(contentLines, LOCATION);
function walkLocation(nodes, parentSlug) {
  for (const node of nodes) {
    const slug = addTagRow(contentLines, LOCATION.id, node.name, { parentSlug });
    if (node.children?.length) walkLocation(node.children, node.name);
  }
}
walkLocation(LOCATION.tree, null);

// --- gear: flat sections first, so where a category id is declared both
// here and by a GEAR_GROUPED section's manufacturerCategory (e.g.
// "lens_manufacturer" — Fujifilm/Nikon/etc. have no named lens family but
// still belong in the manufacturer list), the cleaner flat-section name
// wins tag_categories' on-conflict-do-nothing race, and the actual tag
// rows still end up as the union of both lists either way. ---
for (const cat of GEAR_FLAT) {
  addTagCategoryRow(gearLines, { id: cat.id, section: cat.section, name: cat.name, tier: "technical", facet: "gear" });
  for (const name of cat.tags) addTagRow(gearLines, cat.id, name);
}

// --- gear: manufacturer-grouped sections ---
for (const section of GEAR_GROUPED) {
  addTagCategoryRow(gearLines, { id: section.id, section: section.section, name: section.name, tier: "technical", facet: "gear" });
  // Manufacturers get their own row in a shared "gear_manufacturer" bucket
  // per logical group, so e.g. "Sony" as a camera brand and "Sony" as a mic
  // brand are distinct tags scoped to their own category — a creator
  // browsing "Camera Manufacturers" shouldn't see mic brands mixed in.
  addTagCategoryRow(gearLines, { id: section.manufacturerCategory, section: section.section, name: `${section.name} — Manufacturers`, tier: "technical", facet: "gear" });
  for (const group of section.groups) {
    addTagRow(gearLines, section.manufacturerCategory, group.manufacturer);
    for (const item of group.items) {
      addTagRow(gearLines, section.id, item, { manufacturer: group.manufacturer, parentSlug: null });
    }
  }
  for (const name of section.extraFlat ?? []) addTagRow(gearLines, section.id, name);
}

// --- support tags for the explicit implies chains (class/sensor/mount) ---
addTagCategoryRow(gearLines, { id: "gear_class", section: 31, name: "Gear Class", tier: "technical", facet: "gear" });
addTagCategoryRow(gearLines, { id: "gear_sensor_format", section: 31, name: "Sensor Format", tier: "technical", facet: "gear" });
addTagCategoryRow(gearLines, { id: "gear_mount", section: 31, name: "Mount", tier: "technical", facet: "gear" });
for (const name of IMPLIES_SUPPORT_TAGS.gear_class) addTagRow(gearLines, "gear_class", name);
for (const name of IMPLIES_SUPPORT_TAGS.gear_sensor_format) addTagRow(gearLines, "gear_sensor_format", name);
for (const name of IMPLIES_SUPPORT_TAGS.gear_mount) addTagRow(gearLines, "gear_mount", name);

// --- implies: every gear item -> its own manufacturer (mechanical) ---
function findTagCategoryFor(name, categoryId) {
  return `(select id from tags where category_id = ${sqlLiteral(categoryId)} and slug = ${sqlLiteral(slugify(name))})`;
}
for (const section of GEAR_GROUPED) {
  for (const group of section.groups) {
    const mfrRef = findTagCategoryFor(group.manufacturer, section.manufacturerCategory);
    for (const item of group.items) {
      const itemRef = findTagCategoryFor(item, section.id);
      impliesLines.push(
        `insert into tag_implies (tag_id, implied_tag_id) select ${itemRef}, ${mfrRef} where ${itemRef} is not null and ${mfrRef} is not null on conflict do nothing;`
      );
    }
  }
}

// --- implies: the two spec-given explicit full chains ---
// These reference tags across several different categories, so resolve
// each target by name across the categories it could plausibly be in.
const CROSS_CATEGORY_LOOKUP = (name) => {
  const candidates = ["camera_manufacturer", "camera_model", "gear_class", "gear_sensor_format", "gear_mount"];
  const exprs = candidates.map((c) => findTagCategoryFor(name, c));
  return `coalesce(${exprs.join(", ")})`;
};
for (const { from, to } of EXPLICIT_IMPLIES) {
  const fromRef = CROSS_CATEGORY_LOOKUP(from);
  for (const target of to) {
    const toRef = CROSS_CATEGORY_LOOKUP(target);
    impliesLines.push(
      `insert into tag_implies (tag_id, implied_tag_id) select ${fromRef}, ${toRef} where ${fromRef} is not null and ${toRef} is not null on conflict do nothing;`
    );
  }
}

function writeMigration(filename, header, lines) {
  const content = `${header}\n\n${lines.join("\n")}\n`;
  writeFileSync(path.join(outDir, filename), content);
  console.log(`Wrote ${filename} (${lines.length} statements)`);
}

writeMigration(
  "20260917110000_tag_taxonomy_seed_content.sql",
  "-- FRAME Tag Taxonomy — seed data, non-gear sections (1-11: content type,\n-- fiction/documentary genre, sports, lifestyle, music, gaming, technology,\n-- mood, visual style, location). Generated by scripts/generate-tag-seed.mjs\n-- from a direct transcription of the \"FRAMES TAG TAXONOMY\" spec PDF — do\n-- not hand-edit; edit the script's source data and regenerate instead.",
  contentLines
);
writeMigration(
  "20260917120000_tag_taxonomy_seed_gear.sql",
  "-- FRAME Tag Taxonomy — seed data, gear sections (13-30: camera, lens,\n-- lighting, audio, support, movement, drones, filters, film stock,\n-- monitoring, post production, specialty capture, production design,\n-- editing technique, craft) plus every gear item's manufacturer tag.\n-- Generated by scripts/generate-tag-seed.mjs — do not hand-edit.",
  gearLines
);
writeMigration(
  "20260917130000_tag_taxonomy_seed_implies.sql",
  "-- FRAME Tag Taxonomy — tag_implies edges. Deliberately NOT exhaustive:\n-- every gear item implies its own manufacturer (mechanical, always correct\n-- by construction), plus the two full inheritance chains the spec gives\n-- verbatim (Sony FX3, ARRI Alexa 35). Deeper inheritance (camera class/\n-- sensor format/mount) for the other ~250 gear items would require real\n-- per-model product data this generator doesn't have — left unpopulated\n-- rather than guessed. Generated by scripts/generate-tag-seed.mjs.",
  impliesLines
);

console.log(`\nTotal tags: ${[...seenSlugs.values()].reduce((n, s) => n + s.size, 0)}`);
