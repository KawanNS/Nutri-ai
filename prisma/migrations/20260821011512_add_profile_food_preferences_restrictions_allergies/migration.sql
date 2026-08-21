-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "dislikedFoods" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "foodAllergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "foodPreferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "foodRestrictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "likedFoods" TEXT[] DEFAULT ARRAY[]::TEXT[];
