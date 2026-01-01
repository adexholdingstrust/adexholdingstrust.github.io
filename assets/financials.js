/* =========================================================
   ADEX HOLDINGS TRUST — Used to gather the Costs and Financials
========================================================= */

window.ADEX_DATA = {
  trustName: "Adex Holdings Trust",
  tagline: "Residential rentals & land holdings",
  contact: {
    email: "tenantservices@adexholdings.com",
    phone: "+1-949-415-4633",
	  SMS: "+1-949-415-4633"
  },

  /* ======================
     RENTAL PROPERTIES (ALL)
  ====================== */
  rentals: [
    {
      id: "co-townhouse",
      name: "Aurora Hoye Drive Colorado Townhouse",
      type: "Townhouse",
      address: "12061 E Hoye Drive, Aurora, CO 80012",
      city: "Aurora",
      state: "CO",
      country: "USA",
      currency: "USD",
      rent: { amount: 2450, period: "month" },
      HOA: { amount: 300, period: "month" },
      status: "rented",
      summary:
    "Modern townhouse located in a quiet Aurora neighborhood with convenient access to shopping, schools, and major roads.",
     details:
    "This is a well-kept 2-bedroom, 1-and-1/2-bath townhome in the Peachwood subdivision. The main level features an open concept. A family room with a cozy fireplace to enjoy during the holiday season or on snowy Colorado days, a kitchen with quartz countertops & stainless steel appliances, and a dining area. The upper level offers two bedrooms, a full bathroom, and conveniently located laundry (including a washer and dryer). The spacious primary bedroom offers a vaulted ceiling and a ceiling fan. The private backspace can be used for relaxing and gardening (storage closet included). This quiet community offers a pool and clubhouse and is very close to grocery, shopping, highway, and schools. This house comes with two assigned parking spaces.  Great Location!! Close to shopping, dining, RTD bus, and light rail station.  Easy access to I-225 and just 15 minutes to Buckley Space Force Base and 20 minutes to the Denver Tech Center. Ring Security System has been installed with professional monitoring.  Currently occupied.",
      embedQuery: "12061 E Hoye Drive, Aurora, CO 80012",
      mapsLink:
        "https://www.google.com/maps?q=12061+E+Hoye+Drive+Aurora+CO+80012",
      streetViewEmbed: "https://www.google.com/maps?q=&layer=c&cbll=39.6988672,-104.8481339&cbp=11,0,0,0,0&output=svembed",
      photos: ["/assets/photos/hoye/hoye1.png"],
      video: {
        type: "youtube", // youtube | vimeo | mp4
        url: "https://www.youtube.com/watch?v=WdH9qhalWE4"
         }
    },

    {
      id: "co-condo",
      name: "Aurora Oxford Place Colorado Condo",
      type: "Condo",
      address: "13950 E Oxford Place, Aurora, CO 80014",
      city: "Aurora",
      state: "CO",
      country: "USA",
      currency: "USD",
      rent: { amount: 2550, period: "month" },
      HOA: { amount: 600, period: "month" },
      status: "rented",
      summary:
        "Well-maintained condominium in Aurora offering easy access to local amenities and major highways.",
      details:
        "Great location and great community! This is a secured building that requires a key or resident access code to enter the lobby. Easy access to the highway. From the moment you open the door you get the feel of uniqueness. This floorplan feels like it's one of a kind. Your entry into the home takes you from a hallway that leads you to the kitchen, and great room area. The kitchen offers space to move around in. Your large dining room over looks the massive great room, which makes this condo the perfect place to entertain guest. Gain access to the balcony from the dining area or the great room. This unit receives plenty of light due to the abundance of windows. Travel down a second hallway to not one, or two, but three spacious bedrooms. You will also observe a walk in laundry room, along with a full bathroom prior to reaching the bedrooms. The front loading washer and dryer stay with the unit. The Master bedroom is huge, with his and her closets. The Master bathroom also boast a rare five piece bath. When you say location, location, location this is what they are talking about. In the Cherry Creek School District. Close to shopping, dining, and Cherry Creek State Park. While the carpet may have possibly another year of life in it, with a deep cleaning, the seller is offering a generous $2000 carpet allowance with the sell of the property. This gives the buyer the opportunity to bring the space to life with their own ideas. Welcome home at Pier Point Village. UNDERGROUND GARAGE PARKING SPACE (Space FF). ADDITIONAL STORAGE SPACE (Storage unit II). Currently occupied.",
      embedQuery: "13950 E Oxford Place, Aurora, CO 80014",
      mapsLink:
        "https://www.google.com/maps?q=13950+E+Oxford+Place+Aurora+CO+80014",
      streetViewEmbed:
          "https://www.google.com/maps/embed?pb=!4v1766715350705!6m8!1m7!1s6Mbhl1428ypUr9dgFDX2jA!2m2!1d39.64103040953596!2d-104.8254105634934!3f175.28680071718463!4f7.954084946855772!5f0.40029571729599617&output=svembed",
      photos: ["/assets/photos/oxford/oxford1.png"],
      video: {
        type: "youtube", // youtube | vimeo | mp4
        url: "https://www.youtube.com/watch?v=M4NqBlfMiGI"
         }
    },

    {
      id: "ca-sfh-fallbrook",
      name: "Fallbrook Single-Family Home",
      type: "Single Family",
      address: "464 Calabrese St, Fallbrook, CA 92028",
      city: "Fallbrook",
      state: "CA",
      country: "USA",
      currency: "USD",
      rent: { amount: 4500, period: "month" },
      HOA: { amount: 250, period: "month" },
      status: "rented",
      summary:
        "Spacious two-story single-family home in Fallbrook, California, with a quiet suburban feel.",
      details:
        "Enjoy Great Mountain Views from the backyard!! The house sits atop all other houses in the neighborhood. Impeccably maintained Beautiful Westbury Model home. High-end upgrades and designer touches throughout. Stunning reclaimed wood entry wall.  Huge open kitchen with a large island, granite counters, and a beautifully tiled backsplash. All stainless steel appliances. Upgraded Edison bulb pendant lights and chandelier in the dining area. Luxury plank flooring and upgraded carpeting throughout. The master bedroom has he and she walk-in closet.  They are two other bedrooms upstairs that have a shared bathroom with the jack and jill style allowing both second and third bedrooms have direct access to the bathroom from their respective bedrooms. The 4th Bedroom is conveniently on the first floor for older adults that may not be able to access the stairs or young adults who may need some privacy from their parents with their own bathroom. There’s a private loft with a wood feature wall. Currently occupied. Please note that the video is for a comparison house right beside the same house.",
      embedQuery: "464 Calabrese St, Fallbrook, CA 92028",
      mapsLink:
        "https://www.google.com/maps?q=464+Calabrese+St+Fallbrook+CA+92028",
      // Facing ~210 degrees
      streetViewEmbed:
        "https://www.google.com/maps/embed?pb=!4v1766785505734!6m8!1m7!1sxZ0A6vFbjnLbj9LDsCmupA!2m2!1d33.35443295883505!2d-117.1489938555766!3f303.42987!4f0!5f0.7820865974627469&output=svembed",
      photos: ["/assets/photos/calabrese/calabrese1.png"],
      video: {
        type: "youtube", // youtube | vimeo | mp4
        url: "https://www.youtube.com/watch?v=-Hy2a6Kan5E&t=5s"
         }

    }   // ✅ closes last rental object
  ],    // ✅ closes rentals array

  /* ======================
     LAND HOLDINGS (ALL 11)
  ====================== */
  lands: [
    {
      id: "pahrump-nv-232",
      name: "Pahrump, Nevada",
      acres: 2.32,
      address: "7600 Arabian Way, Pahrump, NV 89061",
      state: "NV",
      county: "Nye County",
      country: "USA",
      Taxes: { amount: 0, period: "month" },
      Payments: { amount: 850, period: "month" },
      currency: "USD",
      parcelId: "045-243-39",
      embedQuery: "7600 Arabian Way, Pahrump, NV 89061",
      center: [-115.9839, 36.2083],
      links: {
        maps: "https://www.google.com/maps?q=7600+Arabian+Way+Pahrump+NV+89061"
      },
      assessor: { deepLink: "https://nyenv-assessor.devnetwedge.com/parcel/view/04524339/2026", zoning: null, assessedValue: null },
      geo: null,
	  photos: ["/assets/photos/pahrump/pahrump1.png"],
      video: {
        type: "youtube", // youtube | vimeo | mp4
        url: "https://www.youtube.com/watch?v=DGA5_yQVZy4"
         }
    },

    {
      id: "apache-az-464",
      name: "Apache County, Arizona (Arizona Park Estates Unit IV)",
      acres: 4.64,
      state: "AZ",
      county: "Apache County",
      country: "USA",
      Taxes: { amount: 260.32, period: "month" },
      Payments: { amount: 0, period: "month" },
      currency: "USD",
      parcelId: "206-30-098",
      embedQuery: "Arizona Park Estates Unit IV Apache County AZ",
      center: [-109.3645, 34.9146],
      links: {
        maps: "https://www.google.com/maps?q=Apache+County+AZ+206-30-098"
      },
      assessor: { deepLink: "https://eagleassessor.co.apache.az.us/assessor/taxweb/account.jsp?guest=true&accountNum=R0042800", zoning: null, assessedValue: null },
      geo: null,
	  photos: ["/assets/photos/apache/apache1.png"],
		
      video: {
        type: "youtube", // youtube | vimeo | mp4
        url: "https://www.youtube.com/watch?v=XXXX"
         }
    },

    {
      id: "navajo-az-10",
      name: "Navajo County, Arizona",
      acres: 10,
      address: "5201 Spencer Ln, Heber, AZ 86025",
      state: "AZ",
      county: "Navajo County",
      country: "USA",
      Taxes: { amount: 0, period: "month" },
      Payments: { amount: 10, period: "month" },
      currency: "USD",
      parcelId: "201-23-012",
      embedQuery: "5201 Spencer Ln, Heber, AZ 86025",
      center: [-110.5642, 34.4179],
      links: {
        maps: "https://www.google.com/maps?q=5201+Spencer+Ln+Heber+AZ+86025"
      },
      assessor: { deepLink: "https://apps.navajocountyaz.gov/NavajoWebPayments/PropertyInformation", zoning: null, assessedValue: null },
      geo: null,
	  photos: ["/assets/photos/navajo/navajo1.png"],
      video: {
        type: "youtube", // youtube | vimeo | mp4
        url: "https://www.youtube.com/watch?v=XXXX"
         }
    },

    {
      id: "elko-nv-10a-1",
      name: "Elko County, Nevada (Parcel 007-12Q-011)",
      acres: 10,
      state: "NV",
      county: "Elko County",
      country: "USA",
      Taxes: { amount: 0, period: "month" },
      Payments: { amount: 10, period: "month" },
      currency: "USD",
      parcelId: "007-12Q-011",
      embedQuery: "Elko County NV 007-12Q-011",
      center: [-115.7631, 41.1632],
      links: {
        parcelPdf: "https://elko-search.gsacorp.io/platmaps/Bk007/007-12Q.pdf",
        maps: "https://www.google.com/maps?q=Elko+County+NV+007-12Q-011"
      },
      assessor: { deepLink: "https://elko-search.gsacorp.io/parcel/00712Q011", zoning: null, assessedValue: null },
      geo: null,
	  photos: ["/assets/photos/elko/elko1.png"],
      video: {
        type: "youtube", // youtube | vimeo | mp4
        url: "https://www.youtube.com/watch?v=XXXX"
         }
    },

    {
      id: "elko-nv-10a-2",
      name: "Elko County, Nevada (Parcel 010-81H-024)",
      acres: 10,
      state: "NV",
      county: "Elko County",
      country: "USA",
      Taxes: { amount: 0, period: "month" },
      Payments: { amount: 10, period: "month" },
      currency: "USD",
      parcelId: "010-81H-024",
      embedQuery: "Elko County NV 010-81H-024",
      center: [-114.9643, 41.5958],
      links: {
        parcelPdf: "https://elko-search.gsacorp.io/platmaps/Bk010/010-81H.pdf",
        maps: "https://www.google.com/maps?q=Elko+County+NV+010-81H-024"
      },
      assessor: { deepLink: "https://elko-search.gsacorp.io/parcel/01081H024", zoning: null, assessedValue: null },
      geo: null,
	  photos: ["/assets/photos/elko/elko1.png"],
      video: {
        type: "youtube", // youtube | vimeo | mp4
        url: "https://www.youtube.com/watch?v=XXXX"
         }
    },

    {
      id: "iron-ut-113",
      name: "Garden Valley Ranchos Lot 1883 Unit 5, Beryl, UT 84714",
      acres: 1.13,
      state: "UT",
      county: "Iron County",
      country: "USA",
      Taxes: { amount: 40, period: "month" },
      Payments: { amount: 0, period: "month" },
      currency: "USD",
      parcelId: "E-1699-0038-0000 ",
      embedQuery: "Beryl, UT 84714",
      center: [-113.2739, 37.8596],
      links: {
        maps: "https://www.google.com/maps?q=Garden+Valley+Ranchos+UT+84753"
      },
      assessor: { deepLink: "https://eagleweb.ironcounty.net/eaglesoftware/taxweb/account.jsp?accountNum=0503376", zoning: null, assessedValue: null },
      geo: null,
	  photos: ["/assets/photos/beryl/beryl1.png"],
      video: {
        type: "youtube", // youtube | vimeo | mp4
        url: "https://www.youtube.com/watch?v=XXXX"
         }
    },

    {
      id: "modena-ut-112",
      name: "Lot 3872 Garden Valley Ranchos #Unit 5, Modena, UT 84753 - Garden Valley Ranchos",
      acres: 1.12,
      state: "UT",
      county: "Iron County",
      country: "USA",
      Taxes: { amount: 0, period: "month" },
      Payments: { amount: 10, period: "month" },
      currency: "USD",
      parcelId: "E-1695-0014-0008-05",
      embedQuery: "Modena UT Iron County",
      center: [-113.8072, 37.8119],
      links: {
        maps: "https://www.google.com/maps?q=Modena+UT"
      },
      assessor: { deepLink: "https://eagleweb.ironcounty.net/eaglesoftware/taxweb/account.jsp?accountNum=0331246", zoning: null, assessedValue: null },
      geo: null,
	  photos: ["/assets/photos/modena/modena1.png"],
      video: {
        type: "youtube", // youtube | vimeo | mp4
        url: "https://www.youtube.com/watch?v=XXXX"
         }
    },

    {
      id: "lancaster-ca-253",
      name: "Lancaster, CA (Parcel 3344-011-068)",
      acres: 2.53,
      address: "202 E Avenue K, Lancaster, CA 93535",
      state: "CA",
      county: "Los Angeles County",
      country: "USA",
      Taxes: { amount: 500, period: "month" },
      Payments: { amount: 0, period: "month" },
      currency: "USD",
      parcelId: "3344-011-068",
      embedQuery: "202 E Avenue K Lancaster CA 93535",
      center: [-118.1271, 34.6983],
      links: {
        maps: "https://maps.app.goo.gl/zVqjSQW6rqFQSiB47"
      },
      assessor: { deepLink: "https://portal.assessor.lacounty.gov/parceldetail/3344011068", zoning: null, assessedValue: null },
      geo: null,
	  photos: ["/assets/photos/lancaster/lancaster1.png"],
      video: {
        type: "youtube", // youtube | vimeo | mp4
        url: "https://www.youtube.com/watch?v=XXXX"
         }
    },

    {
      id: "lancaster-ca-210",
      name: "Lancaster, CA (Parcel 3322-023-014)",
      acres: 2.54,
      address: "E Ave D 6, Lancaster, CA 93535",
      state: "CA",
      county: "Los Angeles County",
      country: "USA",
      Taxes: { amount: 333, period: "month" },
      Payments: { amount: 0, period: "month" },
      currency: "USD",
      parcelId: "3322-023-014",
      embedQuery: "E Avenue D 6 Lancaster CA",
      center: [-118.1626, 34.7191],
      links: {
        maps: "https://maps.app.goo.gl/dMrgtdRDRggyzGbN6"
      },
      assessor: { deepLink: "https://portal.assessor.lacounty.gov/parceldetail/3322023014", zoning: null, assessedValue: null },
      geo: null,
	  photos: ["/assets/photos/lancaster/lancaster1.png"],
      video: {
        type: "youtube", // youtube | vimeo | mp4
        url: "https://www.youtube.com/watch?v=XXXX"
         }
    },

    {
      id: "valencia-nm-rge-1",
      name: "Valencia County, NM (Rio Grande Estates)",
      acres: 1.0,
      state: "NM",
      county: "Valencia County",
      country: "USA",
      Taxes: { amount: 100, period: "month" },
      Payments: { amount: 0, period: "month" },
      currency: "USD",
      parcelId: "101-502-926-426-4141100",
      embedQuery: "Rio Grande Estates Valencia County NM",
      center: [-106.7952, 34.8031],
      links: {
        maps: "https://www.google.com/maps?q=Rio+Grande+Estates+Valencia+County+NM"
      },
      assessor: { deepLink: "https://valenciacountynm-assessorweb.tylerhost.net/assessor/taxweb/account.jsp?accountNum=R016363", zoning: null, assessedValue: "https://valenciacountynm-assessorweb.tylerhost.net/assessor/taxweb/account.jsp?accountNum=R016363&doc=AccountValue" },
      geo: null,
      photos: ["/assets/photos/valencia/valencia1.png"],
      video: {
        type: "youtube", // youtube | vimeo | mp4
        url: "https://www.youtube.com/watch?v=XXXX"
         }
    },

    {
      id: "valencia-nm-rancho-215",
      name: "Valencia County, NM (Rancho Rio Grande)",
      acres: 5.0,
      state: "NM",
      county: "Valencia County",
      country: "USA",
      Taxes: { amount: 155, period: "month" },
      Payments: { amount: 0, period: "month" },
      currency: "USD",
      parcelId: "1-015-029-264-264-141100",
      embedQuery: "Rancho Rio Grande Belen NM",
      center: [-106.6894, 34.6582],
      links: {
        maps: "https://www.google.com/maps?q=Rancho+Rio+Grande+Belen+NM"
      },
      assessor: { deepLink: "https://valenciacountynm-assessorweb.tylerhost.net/assessor/taxweb/account.jsp?accountNum=R016363", zoning: null, assessedValue: "https://valenciacountynm-assessorweb.tylerhost.net/assessor/taxweb/account.jsp?accountNum=R016363&doc=AccountValue" },
      geo: null,
	  photos: ["/assets/photos/valencia/valencia1.png"],
      video: {
        type: "youtube", // youtube | vimeo | mp4
        url: "https://www.youtube.com/watch?v=XXXX"
         }
    }
  ]
};
