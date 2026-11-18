import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { MembershipRole } from "@prisma/client";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RequireMembershipRole } from "../auth/access.decorator";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedActor } from "../auth/auth.types";
import { CreateOrderDto, ListOrdersQueryDto, SaveDraftDto, SubmitInspectionDto } from "./orders.dto";
import { OrdersService } from "./orders.service";

@Controller("orders")
@UseGuards(AccessTokenGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(
    @CurrentActor() actor: AuthenticatedActor,
    @Query() query: ListOrdersQueryDto,
  ) {
    return this.orders.list(actor, query);
  }

  @Post()
  @RequireMembershipRole(MembershipRole.INSPECTOR, MembershipRole.ORG_ADMIN)
  create(
    @CurrentActor() actor: AuthenticatedActor,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateOrderDto,
  ) {
    return this.orders.create(actor, idempotencyKey, body);
  }

  @Get(":orderId")
  get(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("orderId", ParseUUIDPipe) orderId: string,
  ) {
    return this.orders.getOrder(actor, orderId);
  }

  @Put(":orderId/inspection/draft")
  @RequireMembershipRole(MembershipRole.INSPECTOR, MembershipRole.ORG_ADMIN)
  saveDraft(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body() body: SaveDraftDto,
  ) {
    return this.orders.saveDraft(actor, orderId, body);
  }

  @Post(":orderId/inspection/submit")
  @RequireMembershipRole(MembershipRole.INSPECTOR, MembershipRole.ORG_ADMIN)
  submit(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body() body: SubmitInspectionDto,
  ) {
    return this.orders.submit(actor, orderId, body.revisionId);
  }
}
