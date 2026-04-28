import { Test, TestingModule } from '@nestjs/testing';
import { AisController } from './ais.controller';
import { AisService } from './ais.service';

describe('AisController', () => {
  let controller: AisController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AisController],
      providers: [AisService],
    }).compile();

    controller = module.get<AisController>(AisController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
