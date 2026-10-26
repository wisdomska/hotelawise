/* Hotel A-Wise · shared prototype data store.
   Stands in for the Postgres + API layer: the public site, checkout and admin all read and write here.
   Persists to localStorage and syncs live across open tabs. */
(function () {
  if (window.AWStore) return;
  var NS = 'aw.v1.';
  var ymd = function (d) { return d.toISOString().slice(0, 10); };
  var T = ymd(new Date());
  var add = function (s, n) { var d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
  var IMG = 'uploads/Hotel-A-Wise-Images-web/';
  var ROOM_NOS = [['101','STD'],['102','STD'],['103','STD'],['104','STD'],['105','STD'],['106','STD'],['107','DBL'],['108','DBL'],['201','EXE'],['202','EXE'],['203','EXE+'],['204','EXE+'],['205','EXE'],['206','VIP'],['207','VIP'],['208','VIP']];
  var TYPE_NAMES = { STD:'Standard', EXE:'Executive', 'EXE+':'Executive Plus', VIP:'VIP', DBL:'Double' };
  var nowIso = function (offMin) { return new Date(Date.now() + (offMin || 0) * 60000).toISOString(); };

  function datedSeeds() {
    var RATE = { STD:150, EXE:200, 'EXE+':250, VIP:300, DBL:400 };
    var bookings = [
      ['AW-7Q3K','Ama Owusu','055 555 7090','VIP','206',21,2,'Confirmed',300,'Web','MTN MoMo'],
      ['AW-K2M9','Kofi Mensah','024 412 3456','EXE+','203',0,3,'Pending payment',0,'Web',''],
      ['AW-P4XN','Efua Asante','020 123 4567','STD','101',-1,3,'Checked-in',450,'Web','Telecel Cash'],
      ['AW-T7HD','Yaw Darko','027 765 4321','DBL','107',0,2,'Confirmed',240,'Phone','Cash'],
      ['AW-B3RW','Nana Akua Boateng','054 987 6543','EXE','201',-2,2,'Checked-in',400,'Walk-in','Cash'],
      ['AW-Z8QL','Kwesi Appiah','050 111 2233','STD','102',0,1,'Confirmed',150,'Web','Visa'],
      ['AW-M5VE','Adwoa Sarpong','026 222 3344','VIP','207',-1,4,'Checked-in',1200,'Web','MTN MoMo'],
      ['AW-C9JY','Emmanuel Tetteh','023 333 4455','STD','103',1,2,'Confirmed',90,'Web','AirtelTigo Money'],
      ['AW-H6NF','Selorm Agbeko','024 444 5566','EXE+','204',2,5,'Confirmed',380,'Phone','MTN MoMo'],
      ['AW-R2DS','Abdul-Rahman Iddrisu','055 555 6677','STD','104',-3,3,'Checked-in',450,'Walk-in','Cash'],
      ['AW-W4GA','Grace Ofori','020 666 7788','DBL','108',3,2,'Pending payment',0,'Web',''],
      ['AW-E7UP','Michael Quaye','027 777 8899','VIP','208',-1,1,'No-show',90,'Web','MTN MoMo'],
      ['AW-L1KT','Fiifi Koomson','054 888 9900','STD','105',4,3,'Cancelled',0,'Web',''],
      ['AW-N3BZ','Priscilla Ansah','050 999 0011','EXE','202',0,2,'Confirmed',400,'Web','Mastercard'],
      ['AW-S5QM','Kojo Antwi','024 101 0101','STD','106',5,2,'Confirmed',90,'Web','MTN MoMo'],
      ['AW-Y8RC','Akosua Frimpong','055 121 2121','EXE','205',6,3,'Confirmed',180,'Phone','Telecel Cash'],
      ['AW-F2QA','Ama Owusu','055 555 7090','VIP','208',2,2,'Confirmed',600,'Web','MTN MoMo']
    ].map(function (r) { return { ref:r[0], guest:r[1], phone:r[2], email:'', code:r[3], room:r[4], ci:add(T, r[5]), nights:r[6], guests:2, status:r[7], total:RATE[r[3]] * r[6], paid:r[8], source:r[9], method:r[10], arrival:r[0]==='AW-K2M9' ? '02:00' : '', requests:r[0]==='AW-K2M9' ? 'Landing 02:40 from Lagos. A quiet room, please.' : '', note:'', live:false }; });
    var rentals = [
      ['AWR-2611','Abena Owusu-Ansah','024 556 1020','Wedding',0,0,{canopy:4,foldchair:100,longtable:10},'Collected',1],
      ['AWR-2598','Rev. Samuel Addo','020 441 8890','Church event',-2,-1,{chair:150,longtable:6},'Collected',1],
      ['AWR-2620','Ofori family','055 873 2210','Funeral',2,3,{canopy:6,chair:200,longtable:10},'Ready for pickup',1],
      ['AWR-2633','Esinam Kpodo','026 119 4432','Birthday',4,4,{canopy:2,chair:50,shorttable:6},'Reserved',0],
      ['AWR-2640','Ghana Nurses Assoc., Achimota','030 222 9810','Corporate',6,6,{shorttable:10,foldchair:60},'Reserved',0],
      ['AWR-2589','Mavis Acheampong','054 700 3311','Wedding',-4,-3,{canopy:3,foldchair:120,cloth:12},'Returned',1],
      ['AWR-2577','Daniel Owusu','050 600 1188','Outdooring',-6,-5,{canopy:2,chair:80},'Completed',1],
      ['AWR-2602','Kwabena Nkrumah','024 990 1234','Party',-1,-1,{chair:50},'Cancelled',0]
    ].map(function (r) { return { ref:r[0], who:r[1], phone:r[2], email:'', occasion:r[3], from:add(T, r[4]), to:add(T, r[5]), items:r[6], fulfil:'Pickup', status:r[7], paidPct:r[8], live:false }; });
    var enq = [
      ['EQ-31K','Lydia Mensah','024 553 1188','Wedding reception','Compound',180,14,'New',''],
      ['EQ-32P','Ecobank, Achimota branch','030 276 1100','Staff training day','Conference room',30,9,'New',''],
      ['EQ-28D','Asante family','055 310 7765','Funeral reception','Compound',150,5,'Quoted','GHS 4,500'],
      ['EQ-25R','Rotary Club Ofankor','020 812 3344','Fundraiser dinner','Compound',120,11,'Deposit paid','GHS 3,800'],
      ['EQ-19T','St. Peter\'s Youth','024 700 9090','Weekend retreat','Conference room',40,-4,'Done','GHS 1,600']
    ].map(function (r) { return { ref:r[0], who:r[1], phone:r[2], what:r[3], venue:r[4], guests:r[5], date:add(T, r[6]), stage:r[7], quote:r[8], notes:'', live:false }; });
    var blackouts = [
      { id:'bo1', from:add(T,5), to:add(T,6), rooms:'All', reason:'Family wedding, full buy-out' },
      { id:'bo2', from:add(T,13), to:add(T,13), rooms:'All', reason:'Corporate retreat' },
      { id:'bo3', from:add(T,30), to:add(T,34), rooms:'108', reason:'Bathroom refit' }
    ];
    return { bookings:bookings, rentals:rentals, enq:enq, blackouts:blackouts };
  }

  function staticSeeds() {
    var p = function (s) { return IMG + s; };
    var gallery = [
      ['02-rooms/standard-room.jpg','Rooms','Standard Room'],['03-bathrooms/vip-bathroom.jpg','Bathrooms','VIP bathroom'],['04-spaces/second-floor-porch.jpg','Spaces','Second-floor porch'],
      ['04-spaces/second-floor-reception-event-1.jpg','Events','Second-floor reception, dressed for dinner'],['02-rooms/vip-room-1.jpg','Rooms','VIP Room'],['04-spaces/spacious-hallway.jpg','Spaces','The hallway'],
      ['05-services-and-rentals/private-events.jpg','Events','Wedding in the compound'],['02-rooms/executive-room-1.jpg','Rooms','Executive Room'],['03-bathrooms/executive-bathroom.jpg','Bathrooms','Executive bathroom'],
      ['04-spaces/first-floor-porch.jpg','Spaces','First-floor porch'],['04-spaces/conference-room-angle-1.jpg','Spaces','Conference room'],['02-rooms/double-bed-room.jpg','Rooms','Double Room'],
      ['04-spaces/first-floor-reception-event.jpg','Events','First-floor reception, event set-up'],['03-bathrooms/standard-bathroom.jpg','Bathrooms','Standard bathroom'],['04-spaces/staircase.jpg','Spaces','Staircase'],
      ['02-rooms/vip-room-2.jpg','Rooms','VIP Room, detail'],['04-spaces/second-floor-reception-event-2.jpg','Events','Second-floor reception, round tables'],['03-bathrooms/vvip-bathroom.jpg','Bathrooms','VIP rain shower'],
      ['01-hero-and-exterior/hotel-compound.jpg','Spaces','The compound'],['04-spaces/conference-room-angle-2.jpg','Spaces',''],['02-rooms/executive-room-2-customised-sheets.jpg','Rooms','Our customised linen'],
      ['01-hero-and-exterior/hotel-view-reception.jpg','Spaces','Front desk'],['01-hero-and-exterior/gallery-events-hero.jpg','Spaces','Corridor, first floor'],['01-hero-and-exterior/hero-front-desk.jpg','Rooms','Executive Room, morning light']
    ].map(function (g, i) { return { id:'g' + i, src:p(g[0]), cat:g[1], alt:g[2] }; });
    return {
      rates: { STD:150, EXE:200, 'EXE+':250, VIP:300, DBL:400 },
      items: [
        { id:'canopy', name:'Canopy', spec:'10 × 10 ft, white, steel frame', price:250, deposit:100, stock:12, repair:1, img:p('05-services-and-rentals/canopy-rental.jpg') },
        { id:'longtable', name:'Long table', spec:'6 ft, seats 6–8, foldable', price:40, deposit:20, stock:30, repair:0, img:p('05-services-and-rentals/table-rental.jpg') },
        { id:'shorttable', name:'Short table', spec:'4 ft, seats 4, foldable', price:25, deposit:15, stock:40, repair:2, img:p('05-services-and-rentals/table-rental.jpg') },
        { id:'foldchair', name:'Foldable chair', spec:'Padded seat, blue, steel legs', price:5, deposit:2, stock:300, repair:6, img:p('05-services-and-rentals/plastic-chair-rental.jpg') },
        { id:'chair', name:'Regular plastic chair', spec:'Stackable, blue, with arms', price:3, deposit:1, stock:400, repair:4, img:'' },
        { id:'cloth', name:'Tablecloth', spec:'White, fits long tables', price:15, deposit:5, stock:60, repair:0, img:'', custom:true },
        { id:'cover', name:'Chair cover', spec:'White stretch cover with sash', price:4, deposit:1, stock:200, repair:0, img:'', custom:true }
      ],
      msgs: [
        { id:'m1', from:'Lydia Mensah', contact:'024 553 1188', subject:'Events & rentals', status:'New', assignee:'Unassigned', at:nowIso(-60 * 9), text:'Hello, is the compound free on the 14th of next month? We are about 180 guests for a wedding reception. Do you also provide the canopies?' },
        { id:'m2', from:'Kwame Adjei', contact:'kwame.adjei@gmail.com', subject:'Reservation', status:'Assigned', assignee:'Kojo Asante', at:nowIso(-60 * 26), text:'Landing at KIA at 2:40am on Friday. Can I still check in? Booked the Standard room online.' },
        { id:'m3', from:'Naa Dedei', contact:'055 202 9911', subject:'Feedback', status:'Replied', assignee:'Yaw Boateng', at:nowIso(-60 * 50), text:'Just wanted to say the night staff were so kind when our car broke down. Thank you!', reply:'Thank you, Naa. We\'ve passed this on to Yaw and the night team.' },
        { id:'m4', from:'Joseph Arthur', contact:'020 777 1234', subject:'Special request', status:'New', assignee:'Unassigned', at:nowIso(-60 * 55), text:'Can we have an extra mattress in the Double room for my son? Happy to pay.' },
        { id:'m5', from:'Selorm Agbeko', contact:'024 444 5566', subject:'Reservation', status:'Assigned', assignee:'Kojo Asante', at:nowIso(-60 * 74), text:'Please can I change my Executive Plus booking to start one day later?' }
      ],
      gallery: gallery,
      faqs: [
        { id:'f1', q:'Can I really check in at 3am?', a:'Yes. The front desk is staffed 24 hours a day, 7 days a week, holidays included. If you know you\'ll land late, add your arrival time when you book so we have the room ready and the light on.' },
        { id:'f2', q:'What are check-in and check-out times?', a:'Rooms are ready from 2pm and check-out is by 12 noon. Need it earlier or later? Ask the desk. If the room is free, we\'ll usually make it work.' },
        { id:'f3', q:'Is breakfast included?', a:'Breakfast is served 7 to 10am daily and can be added to any booking for GHS 50 per guest per day. Tick the box when you book, or ask at the desk.' },
        { id:'f4', q:'Do you do room service?', a:'Yes, for an extra GHS 20 on top of whatever you order.' },
        { id:'f5', q:'How do I pay?', a:'Online with Mobile Money (MTN, Telecel, AirtelTigo) or Visa and Mastercard through Paystack. You can pay in full or pay a deposit. Cash and MoMo are also fine at the desk.' },
        { id:'f6', q:'What is the cancellation policy?', a:'Cancel free of charge up to 48 hours before check-in for a full refund. Inside 48 hours we keep the deposit. No-shows are charged the first night.' },
        { id:'f7', q:'Can I rent chairs and canopies without staying?', a:'Absolutely. Reserve online for your dates and collect from Wisepak Lane. Pay online, or at the desk when you pick up. We don\'t deliver yet.' },
        { id:'f8', q:'Can I host my event at A-Wise?', a:'Yes. The outdoor compound takes 100 to 200 guests and the second-floor conference room suits meetings and small receptions. Send an enquiry and we\'ll call you back with a quote.' }
      ],
      testimonials: [
        { id:'t1', quote:'Nothing short of extraordinary. Spotless room, incredibly comfortable bed.', from:'John & Mary P. · Achimota', status:'Live' },
        { id:'t2', quote:'The night staff were so kind when our car broke down.', from:'Naa Dedei · from the inbox', status:'Draft' }
      ],
      rateRules: [
        { id:'r1', name:'Christmas & New Year', kind:'range', from:'12-20', to:'01-02', minNights:0, rooms:'All', dir:'up', unit:'pct', amount:15, status:'Active' },
        { id:'r2', name:'Weekend nights', kind:'weekend', from:'', to:'', minNights:0, rooms:'DBL', dir:'up', unit:'ghs', amount:30, status:'Active' },
        { id:'r3', name:'Long stay', kind:'longstay', from:'', to:'', minNights:7, rooms:'All', dir:'down', unit:'pct', amount:10, status:'Active' },
        { id:'r4', name:'Independence Day', kind:'range', from:'03-06', to:'03-06', minNights:0, rooms:'All', dir:'up', unit:'pct', amount:10, status:'Paused' }
      ],
      promoCodes: [
        { id:'p1', code:'AWISE3', type:'breakfast', value:0, until:'2026-11-30', rooms:'All', minNights:3, used:41, status:'Active' },
        { id:'p2', code:'NIGHTOWL', type:'ghs', value:20, until:'2026-12-31', rooms:'All', minNights:0, used:17, status:'Active' },
        { id:'p3', code:'EASTER25', type:'pct', value:10, until:'2026-04-30', rooms:'All', minNights:0, used:62, status:'Active' }
      ],
      roomInfo: {
        STD: { name:'Standard', beds:'1 queen bed', guests:2, bath:'Private shower room', best:'Solo trips, short stays', amen:['Air-conditioning and ceiling fan','Wi-Fi','Flat-screen TV','Work desk and chair','Private bathroom, hot shower','A-Wise customised linen'] },
        EXE: { name:'Executive', beds:'Large double bed', guests:2, bath:'Upgraded rain shower', best:'Business trips, longer stays', amen:['Air-conditioning and ceiling fan','Wi-Fi','Flat-screen TV','Work desk facing the window','Rain shower, LED mirror','A-Wise customised linen'] },
        'EXE+': { name:'Executive Plus', note:'More floor space, same upgraded bathroom' },
        VIP: { name:'VIP', beds:'Large double bed', guests:2, bath:'VIP bathroom', best:'Anniversaries, treating yourself', amen:['Air-conditioning','Wi-Fi','Flat-screen TV','Mini fridge','VIP bathroom, rain shower, LED mirror','A-Wise customised linen'] },
        DBL: { name:'Double', beds:'2 double beds', guests:4, bath:'Private bathroom', best:'Families, friends sharing', amen:['Air-conditioning and ceiling fan','Wi-Fi','Flat-screen TV','Two double beds','Desk and two chairs','Private bathroom, hot shower'] }
      },
      accounts: [
        { email:'admin@hotelawise.com', pw:'admin@123', name:'Esi Asamoah', role:'super' },
        { email:'kojo@hotelawise.com', pw:'staff@123', name:'Kojo Asante', role:'staff' }
      ],
      rules: [
        { id:'r1', name:'Christmas & New Year', applies:'20 Dec – 2 Jan', rooms:'All', adjust:'+15%', status:'Active' },
        { id:'r2', name:'Weekend (Fri–Sat)', applies:'Every week', rooms:'VIP, DBL', adjust:'+GHS 30', status:'Active' },
        { id:'r3', name:'Long stay', applies:'7+ nights', rooms:'All', adjust:'−10%', status:'Active' },
        { id:'r4', name:'Independence Day', applies:'6 Mar', rooms:'All', adjust:'+10%', status:'Paused' }
      ],
      promos: [
        { id:'p1', code:'AWISE3', what:'Breakfast free on 3+ nights', valid:'Until 30 Nov', used:41, status:'Active' },
        { id:'p2', code:'NIGHTOWL', what:'−GHS 20 on check-ins after 23:00', valid:'Until 31 Dec', used:17, status:'Active' },
        { id:'p3', code:'EASTER25', what:'−10%', valid:'Expired', used:62, status:'Paused' }
      ],
      refunds: [
        { id:'rf1', ref:'AWR-2589', who:'Mavis Acheampong', reason:'Deposit return (GHS 18 deducted for damage)', by:'Abena Mensah', amount:452, status:'Pending approval' },
        { id:'rf2', ref:'AW-L1KT', who:'Fiifi Koomson', reason:'Guest cancelled more than 48 hours out', by:'Esi Asamoah', amount:135, status:'Refunded' }
      ],
      roomStatus: (function () { var o = {}; ROOM_NOS.forEach(function (r) { o[r[0]] = ['103','205'].indexOf(r[0]) >= 0 ? 'Cleaning' : r[0] === '108' ? 'Maintenance' : 'Available'; }); return o; })(),
      settings: { phone:'+233 55 555 7090', phone2:'+233 54 012 0400', phone3:'+233 55 555 7033', email:'info@hotelawise.com', wa:'233555557090', address:'No. 1 Wisepak Lane, New Asofan, Accra', checkin:'14:00', checkout:'12:00', breakfast:'07:00–10:00', bfPrice:'50', rsFee:'20', deposit:'30', payAtHotel:true, taxIncl:true, vat:'15', nhil:'2.5', getfund:'2.5', tourism:'1', pk:'pk_live_••••••••3f9a', sk:'sk_live_••••••••••••', sms:'Hi {first_name}, you\'re booked at Hotel A-Wise: {room}, {check_in} to {check_out}. Ref {ref}. We\'ll leave the light on. +233 55 555 7090', timeout:'30', policy:'Free cancellation up to 48 hours before check-in. Inside 48 hours the deposit is kept. No-shows are charged the first night.', banner:true, bannerText:'Book 3 nights, get breakfast on us. Until 30 November.',
        heroTitle:'Your gateway to unforgettable memories', heroSub:'Comfortable rooms, a front desk that never closes and honest prices, in New Asofan, Accra.',
        roomsHeading:'Four room standards, tailored for you', overviewHeading:'An overview of Hotel A-Wise', rentalsHeading:'Rentals for all kinds of events', rentalsSub:'Reserve online. Collect here.',
        spacesHeading:'Spaces for your needs', mapHeading:'Find your way to us',
        roomsIntro:'Per room, per night. No hidden fees.', galleryIntro:'Real photos. What you see is what you get.', contactIntro:'Someone picks up, day or night.',
        rentIntro:'Pick your dates, choose what you need, and reserve it like a room. Collect from No. 1 Wisepak Lane, and pay online now or when you pick up.',
        venueIntro:'Two spaces, quoted per event. Tell us the date and the headcount and we\'ll call back with a price, usually the same day.',
        blurbSTD:"Everything you need and nothing you'll pay extra for. A proper queen bed, cold AC, a hot shower and our own pressed linen. Most people book it for one night and stay three.",
        blurbEXE:'More room to spread out, a desk that faces the window and an upgraded bathroom with a rain shower. Two tiers, same care. Pick the size that suits the trip.',
        blurbVIP:'Premium finishes, a mini fridge, and the VIP bathroom with the good shower. For the anniversary, the promotion, or the night you simply deserve it.',
        blurbDBL:"Two double beds, one bill. Built for families, cousins in town for a wedding, or friends who'd rather share than split up." },
      images: {},
      subscribers: [ { email:'akua.mensah@gmail.com', at:add(T,-12) }, { email:'kwabena.o@yahoo.com', at:add(T,-4) } ],
      audit: [
        ['Esi Asamoah','Changed rate','Executive Plus','GHS 240 → GHS 250',-1,'09:12'],['Kojo Asante','Checked in','AW-P4XN · Efua Asante','Confirmed → Checked-in',-1,'14:03'],
        ['Kojo Asante','Recorded desk payment','AW-B3RW','GHS 0 → GHS 400 (Cash)',-2,'21:40'],['Yaw Boateng','Room status','108','Available → Maintenance',0,'03:11'],
        ['Abena Mensah','Return checklist','AWR-2589','2 chairs damaged, 1 missing',-1,'17:25'],['Esi Asamoah','Issued refund','AW-L1KT','GHS 135 → MTN MoMo',-1,'10:02'],
        ['Esi Asamoah','Granted permission','Abena Mensah','Content: off → on',-3,'11:47'],['System','Released hold','AW-K8XX (expired)','Held → Released',0,'01:58']
      ].map(function (a) { return { who:a[0], what:a[1], target:a[2], change:a[3], when:add(T, a[4]) + ' ' + a[5] }; })
    };
  }

  var KEYS = ['rateRules','promoCodes','roomInfo','accounts','images','bookings','rentals','enq','blackouts','rates','items','msgs','gallery','faqs','testimonials','rules','promos','refunds','roomStatus','settings','subscribers','audit'];
  var DATED = ['bookings','rentals','enq','blackouts'];
  var mem = {};
  var read = function (k) { try { var v = localStorage.getItem(NS + k); return v == null ? undefined : JSON.parse(v); } catch (e) { return undefined; } };
  var persist = function (k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  function boot(force) {
    var ds = datedSeeds(), ss = staticSeeds(), seedDay = read('seedDay');
    KEYS.forEach(function (k) {
      var cur = force ? undefined : read(k);
      if (DATED.indexOf(k) >= 0) {
        if (cur === undefined) cur = ds[k];
        else if (seedDay !== T) cur = cur.filter(function (x) { return x.live; }).concat(ds[k]);
      } else if (cur === undefined) cur = ss[k];
      else if (k === 'settings') cur = Object.assign({}, ss.settings, cur);
      mem[k] = cur; persist(k, cur);
    });
    persist('seedDay', T);
  }
  boot(false);

  var subs = [];
  var emit = function (keys, src) { subs.slice().forEach(function (s) { if (s.src !== src || !src) { try { s.fn(keys); } catch (e) {} } }); };
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key.indexOf(NS) !== 0) return;
    var k = e.key.slice(NS.length); if (KEYS.indexOf(k) < 0) return;
    try { mem[k] = JSON.parse(e.newValue); } catch (err) { return; }
    emit([k]);
  });

  var digits = function (v) { var d = String(v || '').replace(/\D/g, ''); if (d.indexOf('233') === 0) d = d.slice(3); if (d.length === 9) d = '0' + d; return d; };
  var nightsOf = function (ci, co) { return Math.round((new Date(co + 'T00:00:00Z') - new Date(ci + 'T00:00:00Z')) / 864e5); };
  var ACTIVE_B = function (b) { return ['Cancelled','No-show','Checked-out'].indexOf(b.status) < 0; };

  var API = {
    T: T, add: add, ROOM_NOS: ROOM_NOS, TYPE_NAMES: TYPE_NAMES, IMG: IMG,
    get: function (k) { return mem[k]; },
    all: function () { var o = {}; KEYS.forEach(function (k) { o[k] = mem[k]; }); return o; },
    set: function (k, v, src) { mem[k] = v; var ok = persist(k, v); emit([k], src); return ok; },
    img: function (key, fallback) { var m = mem.images || {}; return m[key] || fallback; },
    update: function (k, fn, src) { API.set(k, fn(mem[k]), src); },
    subscribe: function (fn, src) { var s = { fn: fn, src: src }; subs.push(s); return function () { subs = subs.filter(function (x) { return x !== s; }); }; },
    reset: function () { boot(true); emit(KEYS.slice()); },
    phoneDigits: digits,
    samePhone: function (a, b) { var x = digits(a), y = digits(b); return x.length >= 9 && x === y; },
    ref: function (prefix, n) { var c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', s = ''; for (var i = 0; i < (n || 4); i++) s += c[Math.floor(Math.random() * c.length)]; return prefix + '-' + s; },
    typeOf: function (no) { var r = ROOM_NOS.find(function (x) { return x[0] === no; }); return r ? r[1] : null; },
    blackedOut: function (date, roomNo) { return (mem.blackouts || []).some(function (b) { return date >= b.from && date <= b.to && (b.rooms === 'All' || String(b.rooms).split(/,\s*/).indexOf(roomNo) >= 0); }); },
    roomFree: function (no, ci, co, ignoreRef) {
      if (['Maintenance','Out of order'].indexOf((mem.roomStatus || {})[no]) >= 0) return false;
      for (var d = ci; d < co; d = add(d, 1)) if (API.blackedOut(d, no)) return false;
      return !(mem.bookings || []).some(function (b) { return b.room === no && b.ref !== ignoreRef && ACTIVE_B(b) && b.ci < co && add(b.ci, b.nights) > ci; });
    },
    freeRooms: function (type, ci, co, ignoreRef) { return ROOM_NOS.filter(function (r) { return r[1] === type && API.roomFree(r[0], ci, co, ignoreRef); }).map(function (r) { return r[0]; }); },
    roomsOfType: function (type) { return ROOM_NOS.filter(function (r) { return r[1] === type; }).length; },
    nightFull: function (date) { return ['STD','EXE','EXE+','VIP','DBL'].every(function (t) { return API.freeRooms(t, date, add(date, 1)).length === 0; }); },
    nightBlackout: function (date) { return (mem.blackouts || []).some(function (b) { return b.rooms === 'All' && date >= b.from && date <= b.to; }); },
    itemFree: function (id, from, to, ignoreRef) {
      var it = (mem.items || []).find(function (x) { return x.id === id; }); if (!it) return 0;
      var min = Infinity, end = add(to, 1);
      for (var d = from; d <= end; d = add(d, 1)) {
        var used = 0;
        (mem.rentals || []).forEach(function (r) { if (r.ref === ignoreRef || ['Cancelled','Completed','Returned'].indexOf(r.status) >= 0) return; if (d >= r.from && d <= add(r.to, 1)) used += (r.items[id] || 0); });
        min = Math.min(min, it.stock - (it.repair || 0) - used);
      }
      return Math.max(0, min === Infinity ? 0 : min);
    },
    nightsOf: nightsOf,
    ruleHits: function (r, date, type, nights) {
      if (r.status !== 'Active') return false;
      if (r.rooms !== 'All' && r.rooms !== type && !(r.rooms === 'EXE' && type === 'EXE+')) return false;
      var md = date.slice(5), dow = new Date(date + 'T00:00:00Z').getUTCDay();
      if (r.kind === 'range') return r.from <= r.to ? (md >= r.from && md <= r.to) : (md >= r.from || md <= r.to);
      if (r.kind === 'weekend') return dow === 5 || dow === 6;
      if (r.kind === 'longstay') return nights >= (+r.minNights || 1);
      return false;
    },
    stayPrice: function (type, ci, nights) {
      var base = (mem.rates || {})[type] || 0, total = 0, adj = {};
      for (var i = 0; i < nights; i++) {
        var d = add(ci, i), p = base;
        (mem.rateRules || []).forEach(function (r) { if (!API.ruleHits(r, d, type, nights)) return; var delta = r.unit === 'pct' ? Math.round(base * r.amount / 100) : +r.amount; delta = r.dir === 'down' ? -delta : delta; p += delta; adj[r.name] = (adj[r.name] || 0) + delta; });
        total += Math.max(0, p);
      }
      return { base: base * nights, total: total, lines: Object.keys(adj).map(function (k) { return { name: k, amt: adj[k] }; }) };
    },
    promoCheck: function (code, type, nights, subtotal, bfCost) {
      var c = String(code || '').trim().toUpperCase(); if (!c) return { ok:false, err:'Enter a code.' };
      var p = (mem.promoCodes || []).find(function (x) { return x.code === c; });
      if (!p) return { ok:false, err:'We don\'t recognise that code. Check the spelling.' };
      if (p.status !== 'Active') return { ok:false, err:'That code isn\'t active right now.' };
      if (p.until && p.until < T) return { ok:false, err:'That code has expired.' };
      if (p.rooms !== 'All' && p.rooms !== type && !(p.rooms === 'EXE' && type === 'EXE+')) return { ok:false, err:'That code isn\'t valid for this room.' };
      if (p.minNights && nights < p.minNights) return { ok:false, err:'That code needs a stay of ' + p.minNights + ' nights or more.' };
      var d = p.type === 'pct' ? Math.round(subtotal * p.value / 100) : p.type === 'ghs' ? Math.min(subtotal, +p.value) : bfCost;
      return { ok:true, code:c, discount:d, breakfast: p.type === 'breakfast', label: p.type === 'pct' ? p.value + '% off' : p.type === 'ghs' ? 'GHS ' + p.value + ' off' : 'Free breakfast' };
    },
    promoUse: function (code) { API.update('promoCodes', function (l) { return (l || []).map(function (x) { return x.code === code ? Object.assign({}, x, { used: (x.used || 0) + 1 }) : x; }); }); },
    log: function (who, what, target, change) {
      var n = new Date();
      API.update('audit', function (a) { return [{ who: who, what: what, target: target, change: change || '', when: T + ' ' + String(n.getUTCHours()).padStart(2, '0') + ':' + String(n.getUTCMinutes()).padStart(2, '0') }].concat(a || []); });
    }
  };
  window.AWStore = API;
})();
