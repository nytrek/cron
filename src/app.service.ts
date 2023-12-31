import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Cron } from "@nestjs/schedule";
import { load } from "cheerio";
import { isAfter } from "date-fns";
import { XMLParser } from "fast-xml-parser";
import { Model } from "mongoose";
import { z } from "zod";
import { City, CityDocument } from "./schemas/city.schema";
import { Listing, ListingDocument } from "./schemas/listing.schema";
import { typeZodSchema } from "./schemas/type.schema";
import {
  Available,
  Plural,
  Pronoun,
  Singular,
  Specific,
  blocketPaginationQuery,
  getRandomArbitrary,
} from "./utils/helpers";
import { gotenborgCities, stockholmCities } from "./utils/storage";
import { synonyms } from "./utils/synonyms";

@Injectable()
export class AppService {
  constructor(
    @InjectModel(Listing.name)
    private readonly listingModel: Model<ListingDocument>,
    @InjectModel(City.name)
    private readonly cityModel: Model<CityDocument>,
    @InjectModel("Statistic")
    private readonly statisticsModel: Model<ListingDocument>,
  ) {}

  getHello(): string {
    return "Hello World!";
  }

  @Cron("0 1 * * *")
  async checkSamtrygg() {
    const response = await fetch("https://www.samtrygg.se/sitemap.xml");
    const xml = await response.text();
    const parser = new XMLParser();
    const urls: { loc: string; lastmod: string; priority: number }[] = parser
      .parse(xml)
      .urlset.url.filter(
        (item: { loc: string; lastmod: string; priority: number }) =>
          item.loc.includes("object"),
      );
    const dates = await this.listingModel.aggregate([
      {
        $match: {
          active: true,
          origin: "samtrygg",
        },
      },
      {
        $project: {
          _id: 1,
          refId: 1,
          expiredAt: 1,
        },
      },
    ]);
    dates.forEach(async (item) => {
      if (!urls.some((url) => url.loc.includes(item.refId))) {
        await this.listingModel.updateOne(
          {
            _id: item._id,
          },
          {
            active: false,
            expiredAt: new Date(new Date().setDate(new Date().getDate() + 90)),
          },
        );
      }
    });
    return urls;
  }

  @Cron("0 2 * * *")
  async checkBlocket() {
    const total = await fetch("https://api.qasa.se/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operationName: "CityHomeCount",
        query:
          "query CityHomeCount($platform: PlatformEnum, $searchParams: HomeSearchParamsInput!) {homeSearch(platform: $platform searchParams: $searchParams order: ASCENDING  orderBy: RENT ) { filterHomes { totalCount  __typename  } __typename  } }",
        variables: {
          platform: "blocket",
          searchParams: {
            rentalType: ["long_term"],
          },
        },
      }),
    });
    if (total.ok) {
      let count = 0;
      const response = await total.json();
      const totalCount = response.data.homeSearch.filterHomes.totalCount;
      for (let i = 0; i <= totalCount; i = i + 1 * 50) {
        const pagination = await fetch("https://api.qasa.se/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(blocketPaginationQuery(i, count)),
        });
        if (pagination.ok) {
          const listings = await pagination.json();
          for (let i = 0; i < 50; i++) {
            const id = listings.data.homeSearch.filterHomesOffset.nodes[i]?.id;
            const status =
              listings.data.homeSearch.filterHomesOffset.nodes[i]?.status;
            if (status === "archived") {
              await this.listingModel.updateOne(
                {
                  refId: id,
                },
                {
                  active: false,
                  expiredAt: new Date(
                    new Date().setDate(new Date().getDate() + 90),
                  ),
                },
              );
            }
          }
        }
      }
      count++;
    }
  }

  @Cron("0 3 * * *")
  async transferListings() {
    const listings = await this.listingModel.aggregate([
      {
        $match: {
          active: false,
        },
      },
    ]);
    listings.forEach(async (item) => {
      if (isAfter(new Date(), new Date(item.expiredAt))) {
        await new this.statisticsModel(item).save();
      }
    });
    return listings;
  }

  @Cron("0 4 * * *")
  async deleteListings() {
    const dates = await this.listingModel.aggregate([
      {
        $match: {
          active: false,
        },
      },
      {
        $project: {
          _id: 1,
          expiredAt: 1,
        },
      },
    ]);
    dates.forEach(async (item) => {
      if (isAfter(new Date(), new Date(item.expiredAt))) {
        await this.listingModel.deleteOne({
          _id: item._id,
        });
        console.log("deleted ", item._id);
      }
    });
    return dates;
  }

  @Cron("0 5 * * *")
  async crawlSamtrygg() {
    const cities = await this.cityModel.find();
    const new_cities = [];
    const refs = await this.listingModel.aggregate([
      {
        $project: {
          _id: null,
          refId: 1,
          city_formatted: 1,
          type_formatted: 1,
        },
      },
    ]);
    const response = await fetch("https://www.samtrygg.se/sitemap.xml");
    const xml = await response.text();
    const parser = new XMLParser();
    const urls: { loc: string; lastmod: string; priority: number }[] = parser
      .parse(xml)
      .urlset.url.filter(
        (item: { loc: string; lastmod: string; priority: number }) =>
          item.loc.includes("object"),
      );
    for (let i = 0; i < urls.length; i++) {
      const crawl = await fetch(urls[i].loc);
      const html = await crawl.text();
      const $ = load(html);
      /**
       * @description scrape location
       */
      let location: string | string[] = $(".location a")
        .text()
        .trim()
        .replaceAll(",", "")
        .toLowerCase();
      if (
        !z.string().min(2).safeParse(location).success ||
        location.split(" ").length !== 5
      )
        continue;
      location = location.split(" ");
      /**
       * @description scrape address
       */
      const address = location[0] + " " + location[1];
      /**
       * @description format address
       */
      const address_formatted = address
        .replaceAll("å", "a")
        .replaceAll("ä", "a")
        .replaceAll("ö", "o")
        .replaceAll(" ", "-");
      const animal =
        $($($(".ammenities")[1]).find(".columns")[1])
          .find("li:nth-child(4)")
          .attr("itemprop") === "amenityFeature"
          ? true
          : false;
      /**
       * @description scrape area
       */
      const area = $(".boendet div ul li:nth-child(2)")
        .text()
        .trim()
        .split(" ")[0];
      /**
       * @description validate area type
       */
      if (!z.string().min(1).safeParse(area).success) continue;
      const balcony =
        $($($(".ammenities")[1]).find(".columns")[1])
          .find("li:nth-child(3)")
          .attr("itemprop") === "amenityFeature"
          ? true
          : false;
      /**
       * @description scrape city
       */
      const city = stockholmCities.includes(location[location.length - 1])
        ? "stockholm"
        : gotenborgCities.includes(location[location.length - 1])
          ? "göteborg"
          : location[location.length - 1];
      /**
       * @description format city
       */
      const city_formatted = city
        .replaceAll("å", "a")
        .replaceAll("ä", "a")
        .replaceAll("ö", "o")
        .replaceAll(" ", "-");
      /**
       * @description scrape description
       */
      const description = $(".add-content__wrapper p").text().trim();
      const elevator =
        $($($(".ammenities")[1]).find(".columns")[1])
          .find("li:nth-child(2)")
          .attr("itemprop") === "amenityFeature"
          ? true
          : false;
      const furnished =
        $($(".boendet div ul li:nth-child(3)")[0]).text().trim() ===
        "Fullt möblerad"
          ? true
          : false;
      const images: string[] = [];
      $(".pswp-gallery__preview").each((_, element) => {
        images.push($(element).attr("src"));
      });
      let lng: string | undefined;
      let lat: string | undefined;
      $("meta").each((_, element) => {
        if ($(element).attr("itemprop") === "latitude")
          lat = $(element).attr("content");
        if ($(element).attr("itemprop") === "longitude")
          lng = $(element).attr("content");
      });
      if (
        !z.string().min(1).safeParse(lng).success ||
        !z.string().min(1).safeParse(lat).success
      )
        continue;
      let parking = false;
      $(
        $($(".ammenities")[2])
          .find(".columns li")
          .each((_index, element) => {
            $(element).text().trim() === "Parkeringsplats" && (parking = true);
          }),
      );
      /**
       * @description scrape price
       */
      const price = $(".d-price__price")
        .text()
        .trim()
        .replace(":-", "")
        .replace(" ", "")
        .replaceAll(",", "");
      /**
       * @description validate price
       */
      if (!z.string().min(1).safeParse(price).success) continue;
      /**
       * @description scrape room
       */
      const room = $($(".boendet .columns")[1])
        .find("ul li:nth-child(2) span:nth-child(2)")
        .text();
      /**
       * @description validate room
       */
      if (!z.string().min(1).safeParse(room).success) continue;
      /**
       * @description scrape type
       */
      const category = (
        $(".d-price__text div:nth-child(2)").text().split(" : ")?.[1] ?? ""
      )
        .replaceAll(",", "")
        .toLowerCase();
      /**
       * @description format type
       */
      const type =
        category === "bostadsrätt" ||
        category === "hyresrätt" ||
        category === "lägenhet"
          ? "lägenhet"
          : category === "villa"
            ? "hus"
            : category === "rum"
              ? "rum"
              : category === "stuga"
                ? "stuga"
                : "";
      const type_formatted = type
        .replaceAll("å", "a")
        .replaceAll("ä", "a")
        .replaceAll("ö", "o");
      /**
       * @description validate type
       */
      if (!typeZodSchema.safeParse(type_formatted).success) continue;
      /**
       * @description scrape zip based on location
       */
      const zip = location[location.length - 3] + location[location.length - 2];
      if (!z.string().min(1).safeParse(zip).success) continue;
      const listing = {
        address,
        address_formatted,
        animal,
        area: Number(area),
        balcony,
        city,
        city_formatted,
        description,
        elevator,
        furnished,
        images,
        lat: Number(lat),
        lng: Number(lng),
        parking,
        price: Number(price),
        room: Number(room),
        type,
        type_formatted,
        zip,
      };
      if (
        urls[i]?.loc.split("/")[4] &&
        refs.some((item) => item.refId === urls[i].loc.split("/")[4])
      ) {
        this.listingModel.updateOne(
          {
            _id: urls[i].loc.split("/")[4],
          },
          listing,
        );
      } else {
        if (
          !cities.some(
            (c) =>
              c.city_formatted === city_formatted &&
              c.type_formatted === type_formatted,
          ) &&
          !new_cities.some(
            (c) =>
              c.city_formatted === city_formatted &&
              c.type_formatted === type_formatted,
          )
        ) {
          new_cities.push({
            city: city.toLowerCase(),
            city_formatted,
            type_formatted,
            seo: `## Hyr ${Pronoun[type_formatted]} nästa ${
              Singular[type_formatted]
            } i ${city} \n Här kan du hitta ${
              Pronoun[type_formatted]
            } nästa lediga ${
              Singular[type_formatted]
            } i ${city} att hyra! Vi har ett ${
              synonyms[type_formatted].omfattande[
                getRandomArbitrary(
                  0,
                  synonyms[type_formatted].omfattande.length - 1,
                )
              ]
            } utbud på hela {{ count }} lediga ${
              Plural[type_formatted]
            } i ${city}. Gör som ${
              synonyms[type_formatted]["tusentals andra sökande"][
                getRandomArbitrary(
                  0,
                  synonyms[type_formatted]["tusentals andra sökande"].length -
                    1,
                )
              ]
            } och hitta ${Pronoun[type_formatted]} nästa ${
              Singular[type_formatted]
            } genom Frontend. Vi samlar ${
              Singular[type_formatted]
            }-annonser från privata hyresvärdar ${
              synonyms[type_formatted]["landet över"][
                getRandomArbitrary(
                  0,
                  synonyms[type_formatted]["landet över"].length - 1,
                )
              ]
            } så att det ska bli så enkelt som möjligt för dig att hitta ${
              Pronoun[type_formatted]
            } nästa hyres${
              Singular[type_formatted]
            }. \n ## Så hittar du snabbt ${Pronoun[type_formatted]} nästa ${
              Singular[type_formatted]
            } \n För att öka dina ${
              synonyms[type_formatted].chanser[
                getRandomArbitrary(
                  0,
                  synonyms[type_formatted].chanser.length - 1,
                )
              ]
            } att hitta ${Specific[type_formatted]} ${
              Available[type_formatted]
            } ${
              Singular[type_formatted]
            } i ${city}, är det en bra idé att använda vår tjänst ${
              synonyms[type_formatted].regelbundet[
                getRandomArbitrary(
                  0,
                  synonyms[type_formatted].regelbundet.length - 1,
                )
              ]
            } och vara snabb med att hitta nya annonser som matchar dina preferenser. \n\n Oavsett om du är en blivande student, en familj som letar efter ${
              Specific[type_formatted]
            } större ${Singular[type_formatted]} eller bara behöver byta ${
              Singular[type_formatted]
            }, är ${city} ${
              synonyms[type_formatted]["en stad med möjligheter"][
                getRandomArbitrary(
                  0,
                  synonyms[type_formatted]["en stad med möjligheter"].length -
                    1,
                )
              ]
            }. Låt Frontend vara din ${
              synonyms[type_formatted].partner[
                getRandomArbitrary(
                  0,
                  synonyms[type_formatted].partner.length - 1,
                )
              ]
            } i jakten på den perfekta bostaden i ${city}, och låt oss göra processen smidig och effektiv för dig. Sök igenom vårt ${
              synonyms[type_formatted].omfattande[
                getRandomArbitrary(
                  0,
                  synonyms[type_formatted].omfattande.length - 1,
                )
              ]
            } utbud av hyres${
              Plural[type_formatted]
            } i ${city} idag och hitta ${Pronoun[type_formatted]} dröm${
              Singular[type_formatted]
            } här. \n ### Användarvänlig bostadssökning för din bekvämlighet \n Vår ${
              synonyms[type_formatted]["användarvänliga webbplats"][
                getRandomArbitrary(
                  0,
                  synonyms[type_formatted]["användarvänliga webbplats"].length -
                    1,
                )
              ]
            } är ${
              synonyms[type_formatted].utformad[
                getRandomArbitrary(
                  0,
                  synonyms[type_formatted].utformad.length - 1,
                )
              ]
            } för att göra din bostadssökning så enkel och effektiv som möjligt. Med vårt kraftfulla söksystem kan du filtrera annonser enligt dina exakta kriterier. Sök efter ${
              synonyms[type_formatted][
                "prisintervall, antal rum, specifika bekvämligheter"
              ][
                getRandomArbitrary(
                  0,
                  synonyms[type_formatted][
                    "prisintervall, antal rum, specifika bekvämligheter"
                  ].length - 1,
                )
              ]
            } eller önskat område i ${city}. Detta ${
              synonyms[type_formatted]["sparar din tid"][
                getRandomArbitrary(
                  0,
                  synonyms[type_formatted]["sparar din tid"].length - 1,
                )
              ]
            } och hjälper dig att hitta ${
              Singular[type_formatted]
            } som verkligen ${
              synonyms[type_formatted]["uppfyller dina önskemål"][
                getRandomArbitrary(
                  0,
                  synonyms[type_formatted]["uppfyller dina önskemål"].length -
                    1,
                )
              ]
            }. \n ## Hyr ut din ${
              Singular[type_formatted]
            } via Frontend \n Om du är en hyresvärd som har en ${
              Singular[type_formatted]
            } i ${city} som du vill hyra ut, kan du enkelt publicera din annons på vår plattform. Detta gör att ${
              synonyms[type_formatted].potentiella[
                getRandomArbitrary(
                  0,
                  synonyms[type_formatted].potentiella.length - 1,
                )
              ]
            } hyresgäster enkelt kan hitta ${Pronoun[type_formatted]} ${
              Singular[type_formatted]
            } och ${
              synonyms[type_formatted]["kontakta dig direkt"][
                getRandomArbitrary(
                  0,
                  synonyms[type_formatted]["kontakta dig direkt"].length - 1,
                )
              ]
            }.`,
          });
        }
        const temp = await new this.listingModel({
          ...listing,
          active: true,
          origin: "samtrygg",
          refId: urls[i].loc.split("/")[4],
          crawledAt: new Date(),
          url: urls[i].loc,
        }).save();
        console.log("added new listing from samtrygg ", temp._id);
      }
    }
    await this.cityModel.insertMany(new_cities);
    console.log("success - samtrygg");
    return "success - samtrygg";
  }

  @Cron("0 6 * * *")
  async crawlBlocket() {
    const cities = await this.cityModel.find();
    const new_cities = [];
    const refs = await this.listingModel.aggregate([
      {
        $project: {
          _id: null,
          refId: 1,
          city_formatted: 1,
          type_formatted: 1,
        },
      },
    ]);
    const total = await fetch("https://api.qasa.se/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operationName: "CityHomeCount",
        query:
          "query CityHomeCount($platform: PlatformEnum, $searchParams: HomeSearchParamsInput!) {homeSearch(platform: $platform searchParams: $searchParams order: ASCENDING  orderBy: RENT ) { filterHomes { totalCount  __typename  } __typename  } }",
        variables: {
          platform: "blocket",
          searchParams: {
            rentalType: ["long_term"],
          },
        },
      }),
    });
    if (total.ok) {
      let count = 0;
      const response = await total.json();
      const totalCount = response.data.homeSearch.filterHomes.totalCount;
      for (let i = 0; i <= totalCount; i = i + 1 * 50) {
        const pagination = await fetch("https://api.qasa.se/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(blocketPaginationQuery(i, count)),
        });
        if (pagination.ok) {
          const listings = await pagination.json();
          for (let i = 0; i < 50; i++) {
            /**
             * @description scrape address by combining route with streetNumber
             */
            const address = (
              (listings.data.homeSearch.filterHomesOffset.nodes[
                i
              ]?.location.route.trim() ?? "") +
              " " +
              (listings.data.homeSearch.filterHomesOffset.nodes[
                i
              ]?.location.streetNumber.trim() ?? "")
            )
              .replaceAll(",", "")
              .toLowerCase();
            if (!z.string().min(2).safeParse(address).success) continue;
            /**
             * @description format address
             */
            const address_formatted = address
              .replaceAll("å", "a")
              .replaceAll("ä", "a")
              .replaceAll("ö", "o")
              .replaceAll(" ", "-");
            const animal = !!listings.data.homeSearch.filterHomesOffset.nodes[
              i
            ]?.traits.filter(
              (item: { type: string; __typename: string }) =>
                item.type === "pets",
            ).length;
            /**
             * @description scrape area
             */
            const area =
              listings.data.homeSearch.filterHomesOffset.nodes[i]?.squareMeters;
            /**
             * @description validate area type
             */
            if (!z.number().safeParse(area).success) continue;
            const balcony = !!listings.data.homeSearch.filterHomesOffset.nodes[
              i
            ]?.traits.filter(
              (item: { type: string; __typename: string }) =>
                item.type === "balcony",
            ).length;
            /**
             * @description scrape location
             */
            const location = (
              listings.data.homeSearch.filterHomesOffset.nodes[
                i
              ]?.location.locality.trim() ?? ""
            )
              .replaceAll(",", "")
              .toLowerCase();
            /**
             * @description validate location
             */
            if (!z.string().min(1).safeParse(location).success) continue;
            /**
             * @description validate city
             */
            const city = stockholmCities.includes(location)
              ? "stockholm"
              : gotenborgCities.includes(location)
                ? "göteborg"
                : location;
            /**
             * @description format city
             */
            const city_formatted = city
              .replaceAll("å", "a")
              .replaceAll("ä", "a")
              .replaceAll("ö", "o")
              .replaceAll(" ", "-");
            /**
             * @description scrape description
             */
            const description =
              listings.data.homeSearch.filterHomesOffset.nodes[i]?.description;
            const elevator = !!listings.data.homeSearch.filterHomesOffset.nodes[
              i
            ]?.traits.filter(
              (item: { type: string; __typename: string }) =>
                item.type === "elevator",
            ).length;
            const furnished =
              !!listings.data.homeSearch.filterHomesOffset.nodes[
                i
              ]?.traits.filter(
                (item: { type: string; __typename: string }) =>
                  item.type === "furniture",
              ).length;
            const images =
              listings.data.homeSearch.filterHomesOffset.nodes[i]?.uploads.map(
                (item: { url: string }) => item.url,
              ) ?? [];
            const lat =
              listings.data.homeSearch.filterHomesOffset.nodes[i]?.location
                .latitude;
            if (!z.number().safeParse(lat).success) continue;
            const lng =
              listings.data.homeSearch.filterHomesOffset.nodes[i]?.location
                .longitude;
            if (!z.number().safeParse(lng).success) continue;
            const parking = !!listings.data.homeSearch.filterHomesOffset.nodes[
              i
            ]?.traits.filter(
              (item: { type: string; __typename: string }) =>
                item.type === "parking_included",
            ).length;
            /**
             * @description scrape price
             */
            const price =
              listings.data.homeSearch.filterHomesOffset.nodes[i]?.rent;
            /**
             * @description validate price
             */
            if (!z.number().safeParse(price).success) continue;
            /**
             * @description scrape room
             */
            const room =
              listings.data.homeSearch.filterHomesOffset.nodes[i]?.roomCount;
            /**
             * @description validate room
             */
            if (!z.number().safeParse(room).success) continue;
            /**
             * @description scrape type
             */
            const category =
              listings.data.homeSearch.filterHomesOffset.nodes[i]?.type
                .replaceAll(",", "")
                .toLowerCase() ?? "";
            /**
             * @description format type
             */
            const type =
              listings.data.homeSearch.filterHomesOffset.nodes[i]?.roomCount ===
              1
                ? "rum"
                : category === "apartment"
                  ? "lägenhet"
                  : category === "cottage"
                    ? "stuga"
                    : category?.includes("house")
                      ? "hus"
                      : "";
            const type_formatted = type
              .replaceAll("å", "a")
              .replaceAll("ä", "a")
              .replaceAll("ö", "o");
            /**
             * @description validate type
             */
            if (!typeZodSchema.safeParse(type_formatted).success) continue;
            /**
             * @description scrape zip
             */
            const zip =
              listings.data.homeSearch.filterHomesOffset.nodes[i]?.location
                .postalCode;
            /**
             * @description validate zip
             */
            if (!z.string().min(1).safeParse(zip).success) continue;
            const listing = {
              address,
              address_formatted,
              animal,
              area,
              balcony,
              city,
              city_formatted,
              description,
              elevator,
              furnished,
              images,
              lat,
              lng,
              parking,
              price,
              room,
              type,
              type_formatted,
              zip,
            };
            if (
              listings.data.homeSearch.filterHomesOffset.nodes[i]?.id &&
              refs.some(
                (item) =>
                  item.refId ===
                  listings.data.homeSearch.filterHomesOffset.nodes[i].id,
              )
            ) {
              this.listingModel.updateOne(
                {
                  _id: listings.data.homeSearch.filterHomesOffset.nodes[i].id,
                },
                listing,
              );
            } else {
              if (
                !cities.some(
                  (c) =>
                    c.city_formatted === city_formatted &&
                    c.type_formatted === type_formatted,
                ) &&
                !new_cities.some(
                  (c) =>
                    c.city_formatted === city_formatted &&
                    c.type_formatted === type_formatted,
                )
              ) {
                new_cities.push({
                  city: city.toLowerCase(),
                  city_formatted,
                  type_formatted,
                  seo: `## Hyr ${Pronoun[type_formatted]} nästa ${
                    Singular[type_formatted]
                  } i ${city} \n Här kan du hitta ${
                    Pronoun[type_formatted]
                  } nästa lediga ${
                    Singular[type_formatted]
                  } i ${city} att hyra! Vi har ett ${
                    synonyms[type_formatted].omfattande[
                      getRandomArbitrary(
                        0,
                        synonyms[type_formatted].omfattande.length - 1,
                      )
                    ]
                  } utbud på hela {{ count }} lediga ${
                    Plural[type_formatted]
                  } i ${city}. Gör som ${
                    synonyms[type_formatted]["tusentals andra sökande"][
                      getRandomArbitrary(
                        0,
                        synonyms[type_formatted]["tusentals andra sökande"]
                          .length - 1,
                      )
                    ]
                  } och hitta ${Pronoun[type_formatted]} nästa ${
                    Singular[type_formatted]
                  } genom Frontend. Vi samlar ${
                    Singular[type_formatted]
                  }-annonser från privata hyresvärdar ${
                    synonyms[type_formatted]["landet över"][
                      getRandomArbitrary(
                        0,
                        synonyms[type_formatted]["landet över"].length - 1,
                      )
                    ]
                  } så att det ska bli så enkelt som möjligt för dig att hitta ${
                    Pronoun[type_formatted]
                  } nästa hyres${
                    Singular[type_formatted]
                  }. \n ## Så hittar du snabbt ${
                    Pronoun[type_formatted]
                  } nästa ${Singular[type_formatted]} \n För att öka dina ${
                    synonyms[type_formatted].chanser[
                      getRandomArbitrary(
                        0,
                        synonyms[type_formatted].chanser.length - 1,
                      )
                    ]
                  } att hitta ${Specific[type_formatted]} ${
                    Available[type_formatted]
                  } ${
                    Singular[type_formatted]
                  } i ${city}, är det en bra idé att använda vår tjänst ${
                    synonyms[type_formatted].regelbundet[
                      getRandomArbitrary(
                        0,
                        synonyms[type_formatted].regelbundet.length - 1,
                      )
                    ]
                  } och vara snabb med att hitta nya annonser som matchar dina preferenser. \n\n Oavsett om du är en blivande student, en familj som letar efter ${
                    Specific[type_formatted]
                  } större ${
                    Singular[type_formatted]
                  } eller bara behöver byta ${
                    Singular[type_formatted]
                  }, är ${city} ${
                    synonyms[type_formatted]["en stad med möjligheter"][
                      getRandomArbitrary(
                        0,
                        synonyms[type_formatted]["en stad med möjligheter"]
                          .length - 1,
                      )
                    ]
                  }. Låt Frontend vara din ${
                    synonyms[type_formatted].partner[
                      getRandomArbitrary(
                        0,
                        synonyms[type_formatted].partner.length - 1,
                      )
                    ]
                  } i jakten på den perfekta bostaden i ${city}, och låt oss göra processen smidig och effektiv för dig. Sök igenom vårt ${
                    synonyms[type_formatted].omfattande[
                      getRandomArbitrary(
                        0,
                        synonyms[type_formatted].omfattande.length - 1,
                      )
                    ]
                  } utbud av hyres${
                    Plural[type_formatted]
                  } i ${city} idag och hitta ${Pronoun[type_formatted]} dröm${
                    Singular[type_formatted]
                  } här. \n ### Användarvänlig bostadssökning för din bekvämlighet \n Vår ${
                    synonyms[type_formatted]["användarvänliga webbplats"][
                      getRandomArbitrary(
                        0,
                        synonyms[type_formatted]["användarvänliga webbplats"]
                          .length - 1,
                      )
                    ]
                  } är ${
                    synonyms[type_formatted].utformad[
                      getRandomArbitrary(
                        0,
                        synonyms[type_formatted].utformad.length - 1,
                      )
                    ]
                  } för att göra din bostadssökning så enkel och effektiv som möjligt. Med vårt kraftfulla söksystem kan du filtrera annonser enligt dina exakta kriterier. Sök efter ${
                    synonyms[type_formatted][
                      "prisintervall, antal rum, specifika bekvämligheter"
                    ][
                      getRandomArbitrary(
                        0,
                        synonyms[type_formatted][
                          "prisintervall, antal rum, specifika bekvämligheter"
                        ].length - 1,
                      )
                    ]
                  } eller önskat område i ${city}. Detta ${
                    synonyms[type_formatted]["sparar din tid"][
                      getRandomArbitrary(
                        0,
                        synonyms[type_formatted]["sparar din tid"].length - 1,
                      )
                    ]
                  } och hjälper dig att hitta ${
                    Singular[type_formatted]
                  } som verkligen ${
                    synonyms[type_formatted]["uppfyller dina önskemål"][
                      getRandomArbitrary(
                        0,
                        synonyms[type_formatted]["uppfyller dina önskemål"]
                          .length - 1,
                      )
                    ]
                  }. \n ## Hyr ut din ${
                    Singular[type_formatted]
                  } via Frontend \n Om du är en hyresvärd som har en ${
                    Singular[type_formatted]
                  } i ${city} som du vill hyra ut, kan du enkelt publicera din annons på vår plattform. Detta gör att ${
                    synonyms[type_formatted].potentiella[
                      getRandomArbitrary(
                        0,
                        synonyms[type_formatted].potentiella.length - 1,
                      )
                    ]
                  } hyresgäster enkelt kan hitta ${Pronoun[type_formatted]} ${
                    Singular[type_formatted]
                  } och ${
                    synonyms[type_formatted]["kontakta dig direkt"][
                      getRandomArbitrary(
                        0,
                        synonyms[type_formatted]["kontakta dig direkt"].length -
                          1,
                      )
                    ]
                  }.`,
                });
              }
              const temp = await new this.listingModel({
                ...listing,
                active: true,
                origin: count % 2 === 0 ? "blocket" : "qasa",
                refId: listings.data.homeSearch.filterHomesOffset.nodes[i].id,
                crawledAt: new Date(),
                url: listings.data.homeSearch.filterHomesOffset.nodes[
                  i
                ].links.filter(
                  (item: { locale: string }) => item.locale === "sv",
                )[0].url,
              }).save();
              console.log("added new listing from blocket ", temp._id);
            }
          }
        }
        count++;
      }
    }
    await this.cityModel.insertMany(new_cities);
    console.log("success - blocket");
    return "success - blocket";
  }
}
