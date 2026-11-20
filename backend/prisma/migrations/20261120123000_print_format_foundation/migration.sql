CREATE TABLE "print_templates" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "branch_id" INTEGER,
    "document_type" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "page_size" VARCHAR(30) NOT NULL DEFAULT 'A4',
    "orientation" VARCHAR(20) NOT NULL DEFAULT 'portrait',
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "print_template_versions" (
    "id" SERIAL NOT NULL,
    "template_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "configuration" JSONB NOT NULL,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "print_template_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "print_templates_company_id_branch_id_document_type_name_key"
ON "print_templates"("company_id", "branch_id", "document_type", "name");

CREATE INDEX "print_templates_company_id_document_type_is_default_is_active_idx"
ON "print_templates"("company_id", "document_type", "is_default", "is_active");

CREATE UNIQUE INDEX "print_template_versions_template_id_version_key"
ON "print_template_versions"("template_id", "version");

ALTER TABLE "print_templates"
ADD CONSTRAINT "print_templates_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "company_settings"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "print_template_versions"
ADD CONSTRAINT "print_template_versions_template_id_fkey"
FOREIGN KEY ("template_id") REFERENCES "print_templates"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
