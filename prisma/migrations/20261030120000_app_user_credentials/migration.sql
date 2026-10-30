-- Login username/password untuk admin dan manajer.
ALTER TABLE "AppUser" ADD COLUMN "username" TEXT;
ALTER TABLE "AppUser" ADD COLUMN "passwordHash" TEXT;

CREATE UNIQUE INDEX "AppUser_username_key" ON "AppUser"("username");
