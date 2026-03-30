import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';
import { ImportOperationalDataDto } from './dto/import-operational-data.dto';
import { ListOperationalOverviewDto } from './dto/list-operational-overview.dto';
import { UpsertOperationalRecordDto } from './dto/upsert-operational-record.dto';
import { OperationalDataService } from './operational-data.service';

@Controller('operational-data')
@FeaturePlugin('operational_data')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class OperationalDataController {
  constructor(private readonly operationalDataService: OperationalDataService) {}

  @Get('overview')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  listOverview(@Query() query: ListOperationalOverviewDto) {
    return this.operationalDataService.listOverview(query);
  }

  @Get('systems/:systemId/records')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  listSystemRecords(@Param('systemId') systemId: string) {
    return this.operationalDataService.listSystemRecords(systemId);
  }

  @Post('systems/:systemId/records')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  upsertSystemRecord(
    @Param('systemId') systemId: string,
    @Body() dto: UpsertOperationalRecordDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.operationalDataService.upsertSystemRecord(systemId, dto, actor.sub);
  }

  @Post('import')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      limits: {
        fileSize: 3 * 1024 * 1024,
      },
    }),
  )
  importSpreadsheet(
    @UploadedFiles() files: Array<any>,
    @Body() dto: ImportOperationalDataDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.operationalDataService.importSpreadsheet(files || [], dto, actor.sub);
  }
}
