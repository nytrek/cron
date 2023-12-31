import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, HydratedDocument } from "mongoose";

export type ListingDocument = HydratedDocument<Listing> & Document;

/**
 * @see https://github.com/nestjs/nest/blob/master/sample/06-mongoose/src/cats/schemas/cat.schema.ts
 */
@Schema()
export class Listing {
  @Prop({ required: true })
  active: boolean;

  @Prop({ required: true })
  address: string;

  @Prop({ required: true })
  address_formatted: string;

  @Prop({ required: true })
  animal: boolean;

  @Prop({ required: true })
  area: number;

  @Prop({ required: true })
  balcony: boolean;

  @Prop({ required: true })
  city: string;

  @Prop({ required: true })
  city_formatted: string;

  @Prop({ required: true })
  crawledAt: string;

  @Prop({ default: null, required: false })
  description?: string;

  @Prop({ required: true })
  elevator: boolean;

  @Prop({ default: null, required: false })
  email?: string;

  @Prop({ default: null, required: false })
  expiredAt: string;

  @Prop({ required: true })
  furnished: boolean;

  @Prop({ required: true })
  images: string[];

  @Prop({ required: true })
  lat: number;

  @Prop({ default: [], require: false })
  likes: string[];

  @Prop({ required: true })
  lng: number;

  @Prop({ required: true })
  origin: string;

  @Prop({ required: true })
  parking: boolean;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true })
  refId: string;

  @Prop({ required: true })
  room: number;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  type_formatted: string;

  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  zip: string;
}

export const ListingSchema = SchemaFactory.createForClass(Listing);
