/* =========================================================
   ADEX HOLDINGS TRUST — data.js (RESTORED + FIXED)
========================================================= */

window.ADEX_DATA = {
  trustName: "Adex Holdings Trust",
  tagline: "Residential rentals & land holdings",
  contact: {
    email: "tenantservices@adexholdings.com",
    phone: "+1-949-415-4633"
  },

  /* ======================
     RENTAL PROPERTIES (ALL)
  ====================== */
  rentals: [
    {
      id: "co-townhouse",
      name: "Colorado Townhouse",
      type: "Townhouse",
      address: "12061 E Hoye Drive, Aurora, CO 80012",
      city: "Aurora",
      state: "CO",
      country: "USA",
      currency: "USD",
      rent: { amount: 2550, period: "month" },
      status: "rented",
      details:
        "Townhouse located in Aurora, Colorado. Currently occupied.",
      embedQuery: "12061 E Hoye Drive, Aurora, CO 80012",
      mapsLink:
        "https://www.google.com/maps?q=12061+E+Hoye+Drive+Aurora+CO+80012",
      streetViewEmbed: "https://www.google.com/maps?q=&layer=c&cbll=39.6988672,-104.8481339&cbp=11,0,0,0,0&output=svembed",
      photos: []
    },

    {
      id: "co-condo",
      name: "Colorado Condo",
      type: "Condo",
      address: "13950 E Oxford Place, Aurora, CO 80014",
      city: "Aurora",
      state: "CO",
      country: "USA",
      currency: "USD",
      rent: { amount: 2750, period: "month" },
      status: "rented",
      details:
        "Condominium located in Aurora, Colorado. Currently occupied.",
      embedQuery: "13950 E Oxford Place, Aurora, CO 80014",
      mapsLink:
        "https://www.google.com/maps?q=13950+E+Oxford+Place+Aurora+CO+80014",
      streetViewEmbed:
          "https://www.google.com/maps?q=&layer=c&cbll=39.64060312656101,-104.82539119293874&cbp=11,210,0,10,90&output=svembed",
      photos: []
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
      rent: { amount: 5000, period: "month" },
      status: "rented",
      details:
        "Two-story single-family home located in Fallbrook, California.",
      embedQuery: "464 Calabrese St, Fallbrook, CA 92028",
      mapsLink:
        "https://www.google.com/maps?q=464+Calabrese+St+Fallbrook+CA+92028",
      // Facing ~210 degrees
      streetViewEmbed:
        "https://www.google.com/maps?q=&layer=c&cbll=33.354784299024914,-117.14928182355165&cbp=11,210,0,0,0&output=svembed",
      photos: []
    },

    {
      id: "lagos-sterling-greenbay-apt7",
      name: "Sterling Cooperative Estate – Apartment 7",
      type: "Apartment",
      address:
        "Block E, Apartment 7, Sterling Cooperative Estate (GreenBay), Off Mobil Road, Ilaje, Lagos State, Nigeria",
      city: "Ilaje",
      state: "Lagos",
      country: "Nigeria",
      currency: "NGN",
      rent: { amount: 3000000, period: "year" },
      status: "rented",
      details:
        "Apartment located within the Sterling Cooperative Estate (GreenBay)",
      embedQuery:
          "Sterling Cooperative Estate GreenBay Ilaje Lagos Nigeria",
      mapsLink:
          "https://www.google.com/maps?q=GreenBay+Estate+Ilaje+Lagos+Nigeria",
      streetViewEmbed:
          "https://www.google.com/maps?q=&layer=c&cbll=6.440007017584023,3.5697047413577865&cbp=11,90,0,0,0&output=svembed",
      photos: []
    },

    {
      id: "lagos-ibudo-wura-house63",
      name: "Ibudo Wura – House 63",
      type: "House",
      address:
        "Block 8, House 63, Ibudo Wura, Lagos State, Nigeria",
      city: "Lagos",
      state: "Lagos",
      country: "Nigeria",
      currency: "NGN",
      rent: { amount: 3000000, period: "year" },
      status: "available",
      details:
        "Single-family residential house located in the Ibudo Wura community, Lagos.",
      embedQuery: "Ibudo Wura Lagos Nigeria",
      mapsLink:
        "https://www.google.com/maps?q=Ibudo+Wura+Lagos+Nigeria",
      streetViewEmbed: null,
      photos: []
    }
  ],

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
      currency: "USD",
      parcelId: "045-243-39",
      embedQuery: "7600 Arabian Way, Pahrump, NV 89061",
      center: [-115.9839, 36.2083],
      links: {
        maps: "https://www.google.com/maps?q=7600+Arabian+Way+Pahrump+NV+89061"
      },
      assessor: { deepLink: "https://nyenv-assessor.devnetwedge.com/parcel/view/04524339/2026", zoning: null, assessedValue: null },
      geo: null
    },

    {
      id: "apache-az-464",
      name: "Apache County, Arizona (Arizona Park Estates Unit IV)",
      acres: 4.64,
      state: "AZ",
      county: "Apache County",
      country: "USA",
      currency: "USD",
      parcelId: "206-30-098",
      embedQuery: "Arizona Park Estates Unit IV Apache County AZ",
      center: [-109.3645, 34.9146],
      links: {
        maps: "https://www.google.com/maps?q=Apache+County+AZ+206-30-098"
      },
      assessor: { deepLink: "https://eagleassessor.co.apache.az.us/assessor/taxweb/account.jsp?guest=true&accountNum=R0042800", zoning: null, assessedValue: null },
      geo: null
    },

    {
      id: "navajo-az-10",
      name: "Navajo County, Arizona",
      acres: 10,
      address: "5201 Spencer Ln, Heber, AZ 86025",
      state: "AZ",
      county: "Navajo County",
      country: "USA",
      currency: "USD",
      parcelId: "201-23-012",
      embedQuery: "5201 Spencer Ln, Heber, AZ 86025",
      center: [-110.5642, 34.4179],
      links: {
        maps: "https://www.google.com/maps?q=5201+Spencer+Ln+Heber+AZ+86025"
      },
      assessor: { deepLink: "https://apps.navajocountyaz.gov/NavajoWebPayments/PropertyInformation", zoning: null, assessedValue: null },
      geo: null
    },

    {
      id: "elko-nv-10a-1",
      name: "Elko County, Nevada (Parcel 007-12Q-011)",
      acres: 10,
      state: "NV",
      county: "Elko County",
      country: "USA",
      currency: "USD",
      parcelId: "007-12Q-011",
      embedQuery: "Elko County NV 007-12Q-011",
      center: [-115.7631, 41.1632],
      links: {
        parcelPdf: "https://elko-search.gsacorp.io/platmaps/Bk007/007-12Q.pdf",
        maps: "https://www.google.com/maps?q=Elko+County+NV+007-12Q-011"
      },
      assessor: { deepLink: "https://elko-search.gsacorp.io/parcel/00712Q011", zoning: null, assessedValue: null },
      geo: null
    },

    {
      id: "elko-nv-10a-2",
      name: "Elko County, Nevada (Parcel 010-81H-024)",
      acres: 10,
      state: "NV",
      county: "Elko County",
      country: "USA",
      currency: "USD",
      parcelId: "010-81H-024",
      embedQuery: "Elko County NV 010-81H-024",
      center: [-114.9643, 41.5958],
      links: {
        parcelPdf: "https://elko-search.gsacorp.io/platmaps/Bk010/010-81H.pdf",
        maps: "https://www.google.com/maps?q=Elko+County+NV+010-81H-024"
      },
      assessor: { deepLink: "https://elko-search.gsacorp.io/parcel/01081H024", zoning: null, assessedValue: null },
      geo: null
    },

    {
      id: "iron-ut-113",
      name: "Garden Valley Ranchos Lot 1883 Unit 5, Beryl, UT 84714",
      acres: 1.13,
      state: "UT",
      county: "Iron County",
      country: "USA",
      currency: "USD",
      parcelId: "E-1699-0038-0000 ",
      embedQuery: "Beryl, UT 84714",
      center: [-113.2739, 37.8596],
      links: {
        maps: "https://www.google.com/maps?q=Garden+Valley+Ranchos+UT+84753"
      },
      assessor: { deepLink: "https://eagleweb.ironcounty.net/eaglesoftware/taxweb/account.jsp?accountNum=0503376", zoning: null, assessedValue: null },
      geo: null
    },

    {
      id: "modena-ut-112",
      name: "Lot 3872 Garden Valley Ranchos #Unit 5, Modena, UT 84753 - Garden Valley Ranchos",
      acres: 1.12,
      state: "UT",
      county: "Iron County",
      country: "USA",
      currency: "USD",
      parcelId: "E-1695-0014-0008-05",
      embedQuery: "Modena UT Iron County",
      center: [-113.8072, 37.8119],
      links: {
        maps: "https://www.google.com/maps?q=Modena+UT"
      },
      assessor: { deepLink: "https://eagleweb.ironcounty.net/eaglesoftware/taxweb/account.jsp?accountNum=0331246", zoning: null, assessedValue: null },
      geo: null
    },

    {
      id: "lancaster-ca-253",
      name: "Lancaster, CA (Parcel 3344-011-068)",
      acres: 2.53,
      address: "202 E Avenue K, Lancaster, CA 93535",
      state: "CA",
      county: "Los Angeles County",
      country: "USA",
      currency: "USD",
      parcelId: "3344-011-068",
      embedQuery: "202 E Avenue K Lancaster CA 93535",
      center: [-118.1271, 34.6983],
      links: {
        maps: "https://maps.app.goo.gl/zVqjSQW6rqFQSiB47"
      },
      assessor: { deepLink: "https://portal.assessor.lacounty.gov/parceldetail/3344011068", zoning: null, assessedValue: null },
      geo: null
    },

    {
      id: "lancaster-ca-210",
      name: "Lancaster, CA (Parcel 3322-023-014)",
      acres: 2.1,
      address: "E Ave D 6, Lancaster, CA 93535",
      state: "CA",
      county: "Los Angeles County",
      country: "USA",
      currency: "USD",
      parcelId: "3322-023-014",
      embedQuery: "E Avenue D 6 Lancaster CA",
      center: [-118.1626, 34.7191],
      links: {
        maps: "https://maps.app.goo.gl/dMrgtdRDRggyzGbN6"
      },
      assessor: { deepLink: "https://portal.assessor.lacounty.gov/parceldetail/3322023014", zoning: null, assessedValue: null },
      geo: null
    },

    {
      id: "valencia-nm-rge-1",
      name: "Valencia County, NM (Rio Grande Estates)",
      acres: 1.0,
      state: "NM",
      county: "Valencia County",
      country: "USA",
      currency: "USD",
      parcelId: "101-502-926-426-4141100",
      embedQuery: "Rio Grande Estates Valencia County NM",
      center: [-106.7952, 34.8031],
      links: {
        maps: "https://www.google.com/maps?q=Rio+Grande+Estates+Valencia+County+NM"
      },
      assessor: { deepLink: null, zoning: null, assessedValue: null },
      geo: null
    },

    {
      id: "valencia-nm-rancho-215",
      name: "Valencia County, NM (Rancho Rio Grande)",
      acres: 5.0,
      state: "NM",
      county: "Valencia County",
      country: "USA",
      currency: "USD",
      parcelId: "015-029-264-264-141100",
      embedQuery: "Rancho Rio Grande Belen NM",
      center: [-106.6894, 34.6582],
      links: {
        maps: "https://www.google.com/maps?q=Rancho+Rio+Grande+Belen+NM"
      },
      assessor: { deepLink: null, zoning: null, assessedValue: null },
      geo: null
    }
  ]
};
