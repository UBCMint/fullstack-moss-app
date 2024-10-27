# Database_Setup

This is a database setup that uses python to pull sample EEG data into a database set up with Redis, Postgres, and TimescaleDB. 

The sample EEG data [mne.datasets.sample.data_path()](https://mne.tools/stable/generated/mne.datasets.sample.data_path.html#mne.datasets.sample.data_path) can be found from [MNE](https://mne.tools/stable/documentation/datasets.html).

## Getting Started 

1. Clone the Project

```
git clone git@github.com:patrickly1/Database_Setup.git
```
Ensure you have docker installed. See Learn More for installation guide. 

2. Compose Docker Build

```bash
docker-compose up --build
```

You should be connected to PostgreSQL and see the sample data being stored in a /root/nme_data file. After a short delay, the data will be saved to Redis.

## Learn More

Here is the documention used for the database setup:

- [Postgres](https://www.postgresql.org/)
- [Redis](https://redis.io/)
- [TimeScale](https://www.timescale.com/)
- [Docker](https://docs.docker.com/)