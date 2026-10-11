// All site content lives here — the 3D garage and the classic view both render from it.

export const PROFILE = {
  name: 'İsmet Güler',
  role: 'Full-stack & mobile developer',
  line: 'I build apps that people actually use.',
  location: 'Kayseri, Türkiye',
  email: 'gulerrismet@gmail.com',
  linkedin: 'https://www.linkedin.com/in/ismet-g%C3%BCler-0b7ba8351/',
  github: 'https://github.com/IsmetGuler',
  cv: { en: 'assets/cv/Ismet_Guler_CV_EN.pdf', tr: 'assets/cv/Ismet_Guler_CV_TR.pdf' },
  about: [
    'Computer Engineering student, full-stack & mobile developer. My apps are live on the App Store and Google Play, and the ERP I built runs an auto repair shop every single day — shipped fast, end to end, from idea to launch.',
    'Alongside my degree at Erciyes University I’ve worked as a Student R&D Assistant at the university’s Computer Research Center and written avionics software for a TEKNOFEST rocket team — so I’m comfortable everywhere from Firebase backends to bare-metal STM32 firmware.',
    'I speak English at a B2 level and work entirely remotely. If you need someone reliable who delivers and communicates clearly, that’s me.',
  ],
  facts: [
    ['6+', 'apps & products built'],
    ['1,000+', 'installs of Şehir Ustası'],
    ['2 stores', 'live on App Store + Play'],
    ['5.0★', 'client app rating'],
  ],
  services: [
    ['Flutter mobile apps', 'Cross-platform Android & iOS apps with Firebase backends — auth, real-time data, maps, notifications. From MVP to a published store listing.'],
    ['MVPs for founders', 'Your idea turned into a working product fast, so you can validate it with real users before spending big. Full source handed over, no lock-in.'],
    ['Business web apps', 'Full-stack systems for real businesses — ERP, inventory, invoicing, reporting — plus fast, mobile-first sites and PWAs, including moving years of data off legacy software.'],
  ],
};

export const PROJECTS = [
  {
    id: 'oto-servis-erp', car: 'truck', color: '#2a63ff', plate: '38 ERP 001',
    name: 'Oto Servis ERP', lang: 'tr', model: 'Service pickup',
    status: 'In production · used daily by a client',
    tag: 'The ERP that runs an auto repair shop in Ankara, every single day.',
    desc: 'A full-stack ERP for an auto repair shop in Ankara, built from scratch in about 3 weeks and now running the business every day. Vehicle intake & work orders, inventory, accounts, invoicing, 30+ reports and 18 print templates on a 41-table PostgreSQL schema. Migrated 767 customers and 844 vehicles off the shop’s legacy MS Access system, with role-based permissions, race-safe document numbering and a full audit log.',
    specs: [['41', 'PostgreSQL tables'], ['30+', 'reports'], ['18', 'print templates'], ['~3 wks', 'from zero to live']],
    stack: ['Next.js 16', 'React 19', 'TypeScript', 'PostgreSQL', 'Prisma', 'Auth.js', 'Vercel'],
    link: ['GitHub', 'https://github.com/ismetguler/oto-servis-erp'],
  },
  {
    id: 'ticaret-cami', car: 'coupe', color: '#e0182d', plate: '38 TC 002',
    name: 'Ticaret Camı', lang: 'tr', model: 'Grand tourer',
    status: 'Sold & delivered · 5.0★ on the App Store',
    tag: 'A B2B marketplace, commissioned by a client and handed over with the keys.',
    desc: 'A B2B marketplace connecting local merchants and customers in Kayseri — product discovery with category, price and distance filters, Google Maps storefronts, demand pools, and seller analytics. Commissioned by a client, built end-to-end, and handed over with full source.',
    specs: [['5.0★', 'App Store rating'], ['Sold', 'delivered to the client'], ['iOS + Android', 'one Flutter codebase']],
    stack: ['Flutter', 'Firebase', 'Google Maps', 'Apple / Google Sign-In'],
    link: ['App Store', 'https://apps.apple.com/tr/app/ticaret-cam%C4%B1/id6759068811'],
  },
  {
    id: 'sehir-ustasi', car: 'suv', color: '#7d9a45', plate: '38 SU 003',
    name: 'Şehir Ustası', lang: 'tr', model: 'Overlander 4×4',
    status: 'Live on Google Play · 1,000+ installs',
    tag: 'A geography game that takes players across the whole map of Türkiye.',
    desc: 'An educational geography game built around an interactive map of Türkiye. Designed the game mechanics and the geo-based data model, integrated AdMob for monetization, and grew it past 1,000 installs.',
    specs: [['1,000+', 'installs'], ['Google Play', 'live'], ['AdMob', 'monetized']],
    stack: ['Kotlin', 'Firebase', 'AdMob'],
    link: ['Google Play', 'https://play.google.com/store/apps/details?id=com.ismetguler.sehirtahmin'],
  },
  {
    id: 'lie-detector-ai', car: 'police', color: '#5aa2ff', plate: '38 LD 004',
    name: 'Lie Detector AI', model: 'Interceptor', horn: 'Siren',
    status: 'AI · computer vision · on Google Play',
    tag: 'Real-time face tracking and sensor fusion. Nothing gets past this one.',
    desc: 'An interactive biometric experience using Google ML Kit for real-time face tracking and micro-expression detection, fused with accelerometer and PPG sensor signals into a multi-layer analysis algorithm.',
    specs: [['Real-time', 'face tracking'], ['ML Kit', 'on-device vision'], ['PPG + IMU', 'sensor fusion']],
    stack: ['Flutter', 'Google ML Kit', 'Sensor fusion'],
    link: ['Google Play', 'https://play.google.com/store/apps/dev?id=6884504138616325793'],
  },
  {
    id: 'directo', car: 'hatch', color: '#ffc21a', plate: '38 DR 005',
    name: 'Directo', model: 'Pocket hatch',
    status: 'PWA · Flutter Web',
    tag: 'Small, light and instant — messaging with nothing to install.',
    desc: 'A privacy-focused, zero-install messaging utility built on Flutter Web — real-time chat optimized for speed and instant access, without any contact integration.',
    specs: [['Zero', 'installs needed'], ['Real-time', 'chat'], ['PWA', 'runs anywhere']],
    stack: ['Flutter Web', 'Firebase', 'PWA'],
    link: ['GitHub', 'https://github.com/IsmetGuler/directo'],
  },
  {
    id: 'rocket-avionics', car: 'rocket', color: '#ff6a1f', plate: '38 RKT 006',
    name: 'Rocket Avionics', model: 'Streamliner', rev: 'Ignite', horn: 'Burst',
    status: 'Embedded · TEKNOFEST rocket team',
    tag: 'Flight software for a real rocket. The only one here that leaves the ground.',
    desc: 'Real-time flight software on STM32 for a TEKNOFEST rocket team. Implemented Kalman filtering for altitude estimation (~25% sensor-noise reduction) and fail-safe parachute-deployment logic over SPI / I²C with multi-sensor fusion.',
    specs: [['~25%', 'less sensor noise'], ['STM32', 'flight computer'], ['Fail-safe', 'parachute deployment']],
    stack: ['STM32', 'C', 'FreeRTOS', 'Kalman filter'],
    link: ['GitHub', 'https://github.com/IsmetGuler/arfesa-haberlesme-test-case-study'],
  },
  {
    id: 'notification-api', car: 'van', color: '#19c6b3', plate: '38 API 007',
    name: 'Notification API', model: 'Signal van', rev: 'Send a ping',
    status: 'Backend · university R&D',
    tag: 'Delivers every message from the university’s backend to its mobile apps.',
    desc: 'A notification & information-management API built during R&D work at Erciyes University’s Computer Research Center (BAUM), optimizing backend-to-mobile data flow for university systems.',
    specs: [['REST', 'API'], ['BAUM', 'Erciyes Univ. research center'], ['Backend → mobile', 'data flow']],
    stack: ['JavaScript', 'REST API', 'Firebase'],
    link: ['GitHub', 'https://github.com/IsmetGuler/Bilgi_Islem_Bildirim_API'],
  },
];

export const EXPERIENCE = [
  ['Computer Engineering — 3rd year', 'Erciyes University', '2023 – present · GPA 3.19 / 4.00', 'Core CS, algorithms, and software engineering. Building a portfolio of shipped apps alongside coursework.'],
  ['Freelance Full-Stack Developer', 'Oto Servis ERP — auto repair shop, Ankara', 'Aug 2026 – Sep 2026', 'Built and delivered a web-based ERP covering vehicle intake, work orders, inventory, accounts, invoicing and 30+ reports — gathered the requirements with the shop staff and ran the project end to end. In daily use since September 2026.'],
  ['Student R&D Assistant', 'Erciyes University — Computer Research Center (BAUM) · İŞKUR student program', 'Nov 2025 – Jun 2026', 'Built a notification and information-management REST API for university systems, improving backend-to-mobile data flow, and worked with the technical team on the university’s IT infrastructure and support.'],
  ['Avionics Software Developer', 'TEKNOFEST Rocket Competition — Arfesa Team', 'Sep 2025 – Jun 2026', 'Real-time STM32 flight software: Kalman filtering, sensor fusion, and fail-safe recovery logic.'],
];

export const SKILLS = [
  ['Mobile & web', ['Next.js', 'React', 'Tailwind CSS', 'Flutter', 'Dart', 'Kotlin', 'Flutter Web', 'PWA']],
  ['Backend & cloud', ['PostgreSQL', 'Prisma', 'Auth.js', 'Vercel', 'Firebase', 'Cloud Functions', 'REST APIs']],
  ['Languages', ['TypeScript', 'Dart', 'Java', 'C', 'C#', 'Python', 'JavaScript']],
  ['Embedded & tools', ['STM32', 'FreeRTOS', 'Git', 'GitHub', 'VS Code']],
];
