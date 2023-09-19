### Adding Supabase Migration

To make changes to the database schema in your Supabase project, follow these steps to create and apply migrations:

1. **Create a New Migration:**

   Use the Supabase CLI to generate a new migration file. Replace `<migration_name>` with a descriptive name for your migration.

```bash

supabase migrate create -n <migration_name>

```
This will create a new migration file in the `migrations` directory.

2. **Edit The Migrations File**

Open the newly created migration file in the `migrations` directory. Inside this file, define the changes you want to make to the database schema. You can create tables, add columns, modify constraints, and perform other schema-related tasks.

Be careful when editing migration files and ensure that your changes are correct. Migrations are versioned, and incorrect changes can lead to database inconsistencies.


3. **Test Locally:**

Before pushing your migration to the main branch, it's a good practice to test it locally. Use the Supabase CLI to apply the migration to your local development database to verify that it works as expected.


```bash

supabase migrate up -d $LOCAL_DATABASE_URL

```

Replace `$LOCAL_DATABASE_URL` with the URL of your local development database.

4. **Commit and Push:**

Once you're confident that the migration works correctly, commit the migration file and push it to your GitHub repository's `main` branch.

**Important:** Once a migration has been pushed to the main branch, it should be treated as immutable. Do not modify existing migrations to make corrections or updates. Instead, create new migrations to address any issues or changes to the database schema.

5. **Automated Deployment:**

Our CI/CD workflow will automatically deploy the migration to the production database when changes are pushed to the `main` branch. You don't need to manually apply migrations on the production database

By following these steps, you can safely add and deploy Supabase migration changes to your project's database schema.
