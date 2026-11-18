import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { MembershipRole } from "@prisma/client";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RequireMembershipRole } from "../auth/access.decorator";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedActor } from "../auth/auth.types";
import { ReturnInspectionDto, ReviewDecisionDto } from "./reviews.dto";
import { ReviewsService } from "./reviews.service";

@Controller("reviews")
@UseGuards(AccessTokenGuard, RolesGuard)
@RequireMembershipRole(MembershipRole.ORG_ADMIN)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  queue(@CurrentActor() actor: AuthenticatedActor) {
    return this.reviews.listQueue(actor);
  }

  @Get(":orderId")
  get(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("orderId", ParseUUIDPipe) orderId: string,
  ) {
    return this.reviews.getOrderForReview(actor, orderId);
  }

  @Post(":orderId/approve")
  approve(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body() body: ReviewDecisionDto,
  ) {
    return this.reviews.approve(actor, orderId, body);
  }

  @Post(":orderId/return")
  returnForModification(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body() body: ReturnInspectionDto,
  ) {
    return this.reviews.returnForModification(actor, orderId, body);
  }
}
