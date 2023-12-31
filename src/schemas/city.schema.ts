import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, HydratedDocument } from "mongoose";

export type CityDocument = HydratedDocument<City> & Document;

/**
 * @see https://github.com/nestjs/nest/blob/master/sample/06-mongoose/src/cats/schemas/cat.schema.ts
 */
@Schema()
export class City {
  @Prop({ required: true })
  city: string;

  @Prop({ required: true })
  city_formatted: string;

  @Prop({ required: true })
  type_formatted: string;

  @Prop({ required: true })
  seo: string;
}

export const CitySchema = SchemaFactory.createForClass(City);
