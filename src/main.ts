// apps/api/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ↑↑ crește limitele pentru request body (JSON + form)
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '10mb', extended: true }));

  app.enableCors({
    origin: [process.env.WEB_ORIGIN ?? 'http://localhost:3000', process.env.ENGINE_ORIGIN ?? 'http://localhost:5000'],
    credentials: true,
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization','x-engine-secret'],
  });

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 4000);
  console.log(`API listening on http://localhost:${process.env.PORT ?? 4000}`);
}
bootstrap();
