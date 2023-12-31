import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { City, CitySchema } from "./schemas/city.schema";
import { Listing, ListingSchema } from "./schemas/listing.schema";

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    MongooseModule.forRoot(process.env.MONGODB_URI, {
      dbName: "nytrek",
      ignoreUndefined: true,
    }),
    MongooseModule.forFeature([
      {
        name: Listing.name,
        schema: ListingSchema,
        collection: "listings",
      },
      { name: City.name, schema: CitySchema, collection: "cities" },
      {
        name: "Statistic",
        schema: ListingSchema,
        collection: "statistics",
      },
    ]),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
