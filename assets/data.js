/* =========================================================
   ADEX HOLDINGS TRUST — data.js (FINAL)
   - Rentals + Lands
   - Map precision via embedQuery + centroids
   - Street View embeds where available
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
     Canonical structure:
      - address = display
      - embedQuery = map precision
      - streetViewEmbed = optional exact pano
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
      embedQuery: "12061 E Hoye Drive, Aurora, CO 80012",
      mapsLink:
        "https://www.google.com/maps?q=12061+E+Hoye+Drive+Aurora+CO+80012",
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
      embedQuery: "13950 East Oxford Place, Aurora, CO 80014",
      mapsLink:
        "https://www.google.com/maps?q=13950+East+Oxford+Place+Aurora+CO+80014",
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
      embedQuery: "464 Calabrese St, Fallbrook, CA 92028",
      mapsLink:
        "https://www.google.com/maps?q=464+Calabrese+St+Fallbrook+CA+92028",
      streetViewEmbed:
        "https://www.google.com/maps/embed?pb=!4v1!6m8!1m7!1sCAoSLEFGMVFpcFBQY3hNYTRpZ2tnUEJVaEN6bUtSaVZkYkVPSlB4RGxVNE9Z!2m2!1d33.37652!2d-117.24716!3f0!4f0!5f1.1924812503605782",
      photos: []
    },

    {
      id: "lagos-sterling-greenbay-apt7",
      name: "Sterling Cooperative Estate – Apt 7",
      type: "Apartment",
      address:
        "Block E, Apartment 7, Sterling Cooperative Estate (GreenBay), Off Mobil Road, Ilaje, Lagos State, Nigeria",
      city: "Ilaje",
      state: "Lagos",
      country: "Nigeria",
      currency: "NGN",
      rent: { amount: null, period: "year" },
      status: "rented",
      details:
        "Apartment located in Sterling Cooperative Estate (GreenBay), Ilaje, Lagos.",
      embedQuery: "Sterling Cooperative Estate GreenBay Ilaje Lagos Nigeria",
      mapsLink:
        "https://www.google.com/maps?q=Sterling+Cooperative+Estate+GreenBay+Ilaje+Lagos",
      streetViewEmbed: null,
      photos: []
    },

    {
      id: "lagos-ibudo-wura-house63",
      name: "Ibudo Wura – House 63",
      type: "House",
      address: "Block 8, House 63, Ibudo Wura, Lagos State, Nigeria",
      city: "Lagos",
      state: "Lagos",
      country: "Nigeria",
      currency: "NGN",
      rent: { amount: null, period: "year" },
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
     LAND HOLDINGS
     - center = centroid for map accuracy
     - embedQuery = fallback
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
        maps:
          "https://www.google.com/maps?q=7600+Arabian+Way+Pahrump+NV+89061"
      },
      assessor: { deepLink: null, zoning: null, assessedValue: null },
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
      embedQuery: "Arizona Park Estates Unit IV Apache County AZ",
      center: [-109.3645, 34.9146],
      links: {
        maps:
          "https://www.google.com/maps?q=Apache+County+AZ+206-30-098"
      },
      assessor: { deepLink: null, zoning: null, assessedValue: null },
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
        maps:
          "https://www.google.com/maps?q=5201+Spencer+Ln+Heber+AZ+86025"
      },
      assessor: { deepLink: null, zoning: null, assessedValue: null },
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
        maps:
          "https://www.google.com/maps?q=Elko+County+NV+007-12Q-011"
      },
      assessor: { deepLink: null, zoning: null, assessedValue: null },
      geo: null
    }
  ]
};
