import { resolve } from 'path';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { SystemsModule } from './systems/systems.module';
import { ContractsModule } from './contracts/contracts.module';
import { EnergyRecordsModule } from './energy-records/energy-records.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { SupportTicketsModule } from './support-tickets/support-tickets.module';
import { ReportsModule } from './reports/reports.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { ServicePackagesModule } from './service-packages/service-packages.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { FeaturePluginsModule } from './feature-plugins/feature-plugins.module';
import { ContentPostsModule } from './content-posts/content-posts.module';
import { HealthModule } from './health/health.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { MarketingPagesModule } from './marketing-pages/marketing-pages.module';
import { ContactInquiriesModule } from './contact-inquiries/contact-inquiries.module';
import { AiModule } from './ai/ai.module';
import { WebsiteSettingsModule } from './website-settings/website-settings.module';
import { MediaModule } from './media/media.module';
import { MonthlyPvBillingsModule } from './monthly-pv-billings/monthly-pv-billings.module';
import { DeyeConnectionsModule } from './deye-connections/deye-connections.module';
import { OperationalDataModule } from './operational-data/operational-data.module';
import { PortalAutomationModule } from './portal-automation/portal-automation.module';
import { SolarmanConnectionsModule } from './solarman-connections/solarman-connections.module';
import { LuxPowerConnectionsModule } from './luxpower-connections/luxpower-connections.module';
import { ZaloNotificationsModule } from './zalo-notifications/zalo-notifications.module';
import { RequestContextMiddleware } from './common/request-context/request-context.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(process.cwd(), '.env'),
        resolve(process.cwd(), '..', '.env'),
        resolve(process.cwd(), '..', '..', '.env'),
      ],
    }),
    PrismaModule,
    BootstrapModule,
    HealthModule,
    AuditLogsModule,
    FeaturePluginsModule,
    ContentPostsModule,
    AiModule,
    MediaModule,
    MonthlyPvBillingsModule,
    DeyeConnectionsModule,
    OperationalDataModule,
    PortalAutomationModule,
    SolarmanConnectionsModule,
    LuxPowerConnectionsModule,
    ZaloNotificationsModule,
    WebsiteSettingsModule,
    MarketingPagesModule,
    ContactInquiriesModule,
    NotificationsModule,
    AuthModule,
    RolesModule,
    UsersModule,
    CustomersModule,
    SystemsModule,
    ServicePackagesModule,
    ContractsModule,
    EnergyRecordsModule,
    InvoicesModule,
    PaymentsModule,
    SupportTicketsModule,
    ReportsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
