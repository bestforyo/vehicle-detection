import { Type } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

export class CreateReportShareDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays = 30;
}
