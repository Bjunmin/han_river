import { Test, TestingModule } from '@nestjs/testing';
import { AisService } from './ais.service';

describe('AisService', () => {
  let service: AisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AisService],
    }).compile();

    service = module.get<AisService>(AisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
