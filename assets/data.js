/* =========================================================
   ADEX HOLDINGS TRUST — data.js (VALID)
   - Rentals + Lands
   - Currency + rent period
   - Photos + Street View + GeoJSON placeholders
========================================================= */

window.ADEX_DATA = {
  trustName: "Adex Holdings Trust",
  tagline: "Residential rentals & land holdings across the U.S. and Nigeria",
  contact: {
    email: "tenantservices@adexholdings.com",
    phone: "+1-949-415-4633"
  },

  /* ======================
     RENTAL PROPERTIES
     Notes:
      - rent: { amount, period: "month"|"year" }
      - streetViewEmbed: Google embed URL (optional)
      - photos: array of image URLs you control (optional)
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
      rent: { amount: null, period: "month" },
      status: "rented",
      details:
        "Currently occupied. When available, you can submit an inquiry from the Tenant Portal.",
      mapsLink:
        "https://www.google.com/maps/search/?api=1&query=12061+E+Hoye+Drive+Aurora+CO+80012",
      embedQuery: "12061 E Hoye Drive, Aurora, CO 80012",
      streetViewEmbed:
        "https://www.google.com/maps/embed?pb=!4v1!6m8!1m7!1sCAoSLEFGMVFpcFBzN0RHRVhWQ2NBRmQyWHl6Z0pLd3d6dWJmM2ZtbjA2X1ZV!2m2!1d39.699204!2d-104.84129!3f0!4f0!5f1.1924812503605782",
      photos: []
    },

    {
      id: "co-condo",
      name: "Colorado Condo",
      type: "Condo",
      address: "13950 East Oxford Place, Aurora, CO 80014",
      city: "Aurora",
      state: "CO",
      country: "USA",
      currency: "USD",
      rent: { amount: null, period: "month" },
      status: "rented",
      details:
        "Currently occupied. When available, you can submit an inquiry from the Tenant Portal.",
      mapsLink:
        "https://www.google.com/maps/search/?api=1&query=13950+East+Oxford+Place+Aurora+CO+80014",
      embedQuery: "13950 East Oxford Place, Aurora, CO 80014",
      streetViewEmbed:
        "https://www.google.com/maps/embed?pb=!4v1!6m8!1m7!1sCAoSLEFGMVFpcE5fT3dDd2d5Zl9QbU9XbTdwZkt2M19XcUl2QnZzV1d5RVRa!2m2!1d39.66469!2d-104.82283!3f0!4f0!5f1.1924812503605782",
      photos: []
    },

    {
      id: "ca-sfh-2story",
      name: "California Two-Story Single Family Home",
      type: "Single Family",
      address: "464 Calabrese St, Fallbrook, CA 92028",
      city: "Fallbrook",
      state: "CA",
      country: "USA",
      currency: "USD",
      rent: { amount: null, period: "month" },
      status: "rented",
      details:
        "Two-story single-family home located in Fallbrook, California.",
      mapsLink:
        "https://www.google.com/maps/search/?api=1&query=464+Calabrese+St+Fallbrook+CA+92028",
      embedQuery: "464 Calabrese St, Fallbrook, CA 92028",
      streetViewEmbed:
        "https://www.google.com/maps/embed?pb=!4v1!6m8!1m7!1sCAoSLEFGMVFpcFBQY3hNYTRpZ2tnUEJVaEN6bUtSaVZkYkVPSlB4RGxVNE9Z!2m2!1d33.37652!2d-117.24716!3f0!4f0!5f1.1924812503605782",
      photos: []
    },

    {
      id: "lagos-sterling-greenbay-apt7",
      name: "Sterling Cooperative Estate – Apt 7",
      type: "Apartment",
      address:
        "Block E, Apartment 7, Sterling Cooperative Estate (GreenBay), Off Mobil Road, Ilaje, Lagos State, Nigeria 23401",
      city: "Ilaje",
      state: "Lagos",
      country: "Nigeria",
      currency: "NGN",
      rent: { amount: null, period: "year" },
      status: "rented",
      details:
        "Apartment located in Sterling Cooperative Estate (GreenBay), Ilaje, Lagos. Secure residential cooperative estate.",
      mapsLink:
        "https://www.google.com/maps/search/?api=1&query=Sterling+Cooperative+Estate+GreenBay+Ilaje+Lagos",
      embedQuery: "Sterling Cooperative Estate GreenBay Ilaje Lagos Nigeria",
      streetViewEmbed: null,
      photos: []
    },

    {
      id: "lagos-ibudo-wura-house63",
      name: "Ibudo Wura – House 63",
      type: "House",
      address: "Block 8, House 63, Ibudo Wura, Lagos State, Nigeria 23401",
      city: "Lagos",
      state: "Lagos",
      country: "Nigeria",
      currency: "NGN",
      rent: { amount: null, period: "year" },
      status: "available",
      details:
        "Single-family residential house located in the Ibudo Wura community, Lagos.",
      mapsLink:
        "https://www.google.com/maps/search/?api=1&query=Ibudo+Wura+Lagos+Nigeria",
      embedQuery: "Ibudo Wura Lagos Nigeria",
      streetViewEmbed: null,
      photos: []
    }
  ],

  /* ======================
     LAND HOLDINGS
     Notes:
      - geo: optional GeoJSON Feature (Polygon/MultiPolygon)
      - center: optional [lng,lat] for Mapbox pins
      - assessor: deep links + cached fields (optional)
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
      links: {
        maps:
          "https://www.google.com/maps/search/?api=1&query=7600+Arabian+Way+Pahrump+NV+89061"
      },
      assessor: {
        deepLink: null,
        zoning: null,
        assessedValue: null
      },
      center: null,
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
      legal: "ARIZONA PARK ESTATES UNIT IV Lot 98 Unit 4",
      links: {
        maps:
          "https://www.google.com/maps/search/?api=1&query=Apache+County+AZ+206-30-098"
      },
      assessor: {
        deepLink: null,
        zoning: null,
        assessedValue: null
      },
      center: null,
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
      links: {
        maps:
          "https://www.google.com/maps/search/?api=1&query=5201+Spencer+Ln+Heber+AZ+86025"
      },
      assessor: { deepLink: null, zoning: null, assessedValue: null },
      center: null,
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
      legal: "T37N R58E MDB&M Sec 33; NW4SE4NW4",
      links: {
        parcelPdf: "https://elko-search.gsacorp.io/platmaps/Bk007/007-12Q.pdf",
        maps:
          "https://www.google.com/maps/search/?api=1&query=Elko+County+NV+007-12Q-011"
      },
      assessor: { deepLink: null, zoning: null, assessedValue: null },
      center: null,
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
      legal: "T40N R70E MDB&M Sec 31; SW4NW4NE4",
      links: {
        parcelPdf: "https://elko-search.gsacorp.io/platmaps/Bk010/010-81H.pdf",
        maps:
          "https://www.google.com/maps/search/?api=1&query=Elko+County+NV+010-81H-024"
      },
      assessor: { deepLink: null, zoning: null, assessedValue: null },
      center: null,
      geo: null
    },

    {
      id: "iron-ut-113",
      name: "Iron County, Utah (Garden Valley Ranchos)",
      acres: 1.13,
      state: "UT",
      county: "Iron County",
      country: "USA",
      currency: "USD",
      parcelId: null,
      notes: "Garden Valley Ranchos, UT 84753",
      links: {
        maps:
          "https://www.google.com/maps/search/?api=1&query=Garden+Valley+Ranchos+UT+84753"
      },
      assessor: { deepLink: null, zoning: null, assessedValue: null },
      center: null,
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
      links: {
        maps: "https://maps.app.goo.gl/zVqjSQW6rqFQSiB47"
      },
      assessor: { deepLink: null, zoning: null, assessedValue: null },
      center: null,
      geo: null
    },

    {
      id: "lancaster-ca-210",
      name: "Lancaster, CA (Parcel 3322-023-014)",
      acres: 2.1,
      address: "E Ave D 6, Lancaster, CA 93535 (area of E Avenue D-12)",
      state: "CA",
      county: "Los Angeles County",
      country: "USA",
      currency: "USD",
      parcelId: "3322-023-014",
      links: {
        maps: "https://maps.app.goo.gl/dMrgtdRDRggyzGbN6"
      },
      assessor: { deepLink: null, zoning: null, assessedValue: null },
      center: null,
      geo: null
    },

    {
      id: "valencia-nm-rge-1",
      name: "Valencia County, NM (Rio Grande Estates Lot 9, Unit 6, Block 149)",
      acres: 1.0,
      state: "NM",
      county: "Valencia County",
      country: "USA",
      currency: "USD",
      parcelId: "APN 1015029264264141100",
      legal: "Lot 9 Unit 6, Block 149, Rio Grande Estates",
      links: {
        maps:
          "https://www.google.com/maps/search/?api=1&query=Rio+Grande+Estates+Valencia+County+NM+Lot+9+Unit+6+Block+149"
      },
      assessor: { deepLink: null, zoning: null, assessedValue: null },
      center: null,
      geo: null
    },

    {
      id: "valencia-nm-rancho-215",
      name: "Valencia County, NM (Rancho Rio Grande – Parcel 215, Unit 8 East)",
      acres: 5.0,
      state: "NM",
      county: "Valencia County",
      country: "USA",
      currency: "USD",
      parcelId: "Recorder ID 015-029-264-264-141100",
      legal:
        "All of Parcel 215 of Rancho Rio Grande, Unit No. 8 East (incl. gas/oil/mineral rights as owned).",
      links: {
        maps:
          "https://www.google.com/maps/search/?api=1&query=Belen+NM+Valencia+County+Rancho+Rio+Grande+Parcel+215"
      },
      assessor: { deepLink: null, zoning: null, assessedValue: null },
      center: null,
      geo: null
    },

    {
      id: "modena-ut-112",
      name: "Modena, Iron County, Utah",
      acres: 1.12,
      state: "UT",
      county: "Iron County",
      country: "USA",
      currency: "USD",
      parcelId: null,
      notes: "Modena area (see attached parcel image in your records)",
      links: {
        maps:
          "https://www.google.com/maps/search/?api=1&query=Modena+UT+Iron+County+1.12+acres"
      },
      assessor: { deepLink: null, zoning: null, assessedValue: null },
      center: null,
      geo: null
    }
  ]
};
