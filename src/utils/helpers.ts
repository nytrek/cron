export enum Specific {
  "bostad" = "en",
  "lagenhet" = "en",
  "hus" = "ett",
  "stuga" = "en",
  "rum" = "ett",
}

export enum Pronoun {
  "bostad" = "din",
  "lagenhet" = "din",
  "hus" = "ditt",
  "stuga" = "din",
  "rum" = "ditt",
}

export enum Available {
  "bostad" = "ledig bostad",
  "lagenhet" = "ledig lägenhet",
  "hus" = "ledigt hus",
  "stuga" = "ledig stuga",
  "rum" = "ledigt rum",
}

export enum Singular {
  "bostad" = "bostad",
  "lagenhet" = "lägenhet",
  "hus" = "hus",
  "stuga" = "stuga",
  "rum" = "rum",
}

export enum Plural {
  "bostad" = "bostäder",
  "lagenhet" = "lägenheter",
  "hus" = "hus",
  "stuga" = "stugor",
  "rum" = "rum",
}

/**
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random#getting_a_random_number_between_two_values
 * @param min
 * @param max
 * @returns
 */
export function getRandomArbitrary(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}

export const blocketPaginationQuery = (i: number, count: number) => {
  return {
    operationName: "HomeSearchQuery",
    query:
      "query HomeSearchQuery($offset: Int, $limit: Int, $platform: PlatformEnum, $order: HomeSearchOrderEnum, $orderBy: HomeSearchOrderByEnum, $searchParams: HomeSearchParamsInput!) {\n  homeSearch(\n    platform: $platform\n    searchParams: $searchParams\n    order: $order\n    orderBy: $orderBy\n  ) {\n    filterHomesOffset(offset: $offset, limit: $limit) {\n      pagesCount\n      totalCount\n      hasNextPage\n      hasPreviousPage\n      nodes {\n        id\n        firsthand\n        rent\n        tenantBaseFee\n        title\n        minimumPricePerNight\n        maximumPricePerNight\n        averagePricePerNight\n        favoriteMarkedByUser\n        landlord {\n          uid\n          companyName\n          premium\n          professional\n          profilePicture {\n            url\n            __typename\n          }\n          proPilot\n          __typename\n        }\n        user {\n          uid\n          proAgent\n          __typename\n        }\n        location {\n          id\n          latitude\n          longitude\n          route\n          streetNumber\n         postalCode\n          locality\n          sublocality\n          __typename\n        }\n        links {\n          locale\n          url\n          __typename\n        }\n        roomCount\n        seniorHome\n        shared\n        squareMeters\n        studentHome\n        type\n        duration {\n          createdAt\n          endOptimal\n          endUfn\n          id\n          startAsap\n          startOptimal\n          updatedAt\n          __typename\n        }\n        corporateHome\n        publishedAt\n        uploads {\n          id\n          url\n          type\n          title\n          metadata {\n            primary\n            order\n            __typename\n          }\n          __typename\n        }\n        description\n        traits {\n      type\n      __typename\n    }\n        numberOfHomes\n        minRent\n        maxRent\n        minRoomCount\n        maxRoomCount\n        minSquareMeters\n        maxSquareMeters\n        rentalType\n        tenantCount\n        bedCount\n        bedroomCount\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n",
    variables: {
      offset: i,
      limit: 50,
      order: "DESCENDING",
      orderBy: "PUBLISHED_AT",
      platform: count % 2 === 0 ? "blocket" : "qasa",
      searchParams: {
        areaIdentifier: [],
        rentalType: ["long_term"],
      },
    },
  };
};
