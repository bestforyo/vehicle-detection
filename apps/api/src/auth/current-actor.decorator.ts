import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AuthenticatedActor } from "./auth.types";

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedActor => {
    const request = context.switchToHttp().getRequest<{ actor: AuthenticatedActor }>();
    return request.actor;
  },
);
