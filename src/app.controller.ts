import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get("samtrygg")
  async crawlSamtrygg() {
    return this.appService.crawlSamtrygg();
  }

  @Get("blocket")
  async crawlBlocket() {
    return this.appService.crawlBlocket();
  }

  @Get("transfer")
  async transferListings() {
    return this.appService.transferListings();
  }
}
