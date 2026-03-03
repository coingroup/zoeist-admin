# Zoeist Admin Dashboard

Admin dashboard for managing donations, donors, and compliance for Zoeist, Inc.

## Deploy to DigitalOcean App Platform

1. Push this repo to GitHub
2. Connect to DigitalOcean App Platform → Create App
3. Select the GitHub repo
4. Configure as **Static Site**:
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Under component settings, set **Catchall Document** to `index.html`
6. Deploy

## Setup Admin User

After deploying, create an admin user in Supabase:

1. Go to Supabase Dashboard → Authentication → Users → Add User
2. Create a user with email/password
3. Copy the user's UUID
4. Insert into admin_users table:

```sql
INSERT INTO admin_users (auth_user_id, email, display_name, role)
VALUES ('USER-UUID-HERE', 'your@email.com', 'Your Name', 'super_admin');
```

## Features

- **Overview**: KPIs, monthly revenue chart, designation breakdown, recent donations
- **Donations**: Search, filter, paginate, export CSV, resend receipts
- **Donors**: Search, sort by total given, export CSV
- **Compliance**: Pending receipts, large unreceipted donations, filing deadlines, state registrations
