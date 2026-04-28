import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CommonService } from './common.service';

@Controller('common')
export class CommonController {
  constructor(private readonly commonService: CommonService) { }

  @MessagePattern('addsensor')
  getAll(@Payload() data) {
    console.log(data);
  }

}
