export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      apikeys: {
        Row: {
          created_at: string | null
          id: number
          key: string
          limited_to_apps: string[] | null
          limited_to_orgs: string[] | null
          mode: Database["public"]["Enums"]["key_mode"]
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          key: string
          limited_to_apps?: string[] | null
          limited_to_orgs?: string[] | null
          mode: Database["public"]["Enums"]["key_mode"]
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          key?: string
          limited_to_apps?: string[] | null
          limited_to_orgs?: string[] | null
          mode?: Database["public"]["Enums"]["key_mode"]
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "apikeys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_metrics_cache: {
        Row: {
          cached_at: string
          end_date: string
          id: number
          org_id: string
          response: Json
          start_date: string
        }
        Insert: {
          cached_at?: string
          end_date: string
          id?: number
          org_id: string
          response: Json
          start_date: string
        }
        Update: {
          cached_at?: string
          end_date?: string
          id?: number
          org_id?: string
          response?: Json
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_metrics_cache_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      app_versions: {
        Row: {
          app_id: string
          checksum: string | null
          comment: string | null
          created_at: string | null
          deleted: boolean
          external_url: string | null
          id: number
          link: string | null
          manifest:
            | Database["public"]["CompositeTypes"]["manifest_entry"][]
            | null
          min_update_version: string | null
          name: string
          native_packages: Json[] | null
          owner_org: string
          r2_path: string | null
          session_key: string | null
          storage_provider: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          app_id: string
          checksum?: string | null
          comment?: string | null
          created_at?: string | null
          deleted?: boolean
          external_url?: string | null
          id?: number
          link?: string | null
          manifest?:
            | Database["public"]["CompositeTypes"]["manifest_entry"][]
            | null
          min_update_version?: string | null
          name: string
          native_packages?: Json[] | null
          owner_org: string
          r2_path?: string | null
          session_key?: string | null
          storage_provider?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          app_id?: string
          checksum?: string | null
          comment?: string | null
          created_at?: string | null
          deleted?: boolean
          external_url?: string | null
          id?: number
          link?: string | null
          manifest?:
            | Database["public"]["CompositeTypes"]["manifest_entry"][]
            | null
          min_update_version?: string | null
          name?: string
          native_packages?: Json[] | null
          owner_org?: string
          r2_path?: string | null
          session_key?: string | null
          storage_provider?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_versions_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "owner_org_id_fkey"
            columns: ["owner_org"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      app_versions_meta: {
        Row: {
          app_id: string
          checksum: string
          created_at: string | null
          id: number
          owner_org: string
          size: number
          updated_at: string | null
        }
        Insert: {
          app_id: string
          checksum: string
          created_at?: string | null
          id?: number
          owner_org: string
          size: number
          updated_at?: string | null
        }
        Update: {
          app_id?: string
          checksum?: string
          created_at?: string | null
          id?: number
          owner_org?: string
          size?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_versions_meta_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "app_versions_meta_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "app_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_org_id_fkey"
            columns: ["owner_org"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      apps: {
        Row: {
          app_id: string
          channel_device_count: number
          created_at: string | null
          default_upload_channel: string
          icon_url: string
          id: string | null
          last_version: string | null
          manifest_bundle_count: number
          name: string | null
          owner_org: string
          retention: number
          transfer_history: Json[] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          app_id: string
          channel_device_count?: number
          created_at?: string | null
          default_upload_channel?: string
          icon_url: string
          id?: string | null
          last_version?: string | null
          manifest_bundle_count?: number
          name?: string | null
          owner_org: string
          retention?: number
          transfer_history?: Json[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          app_id?: string
          channel_device_count?: number
          created_at?: string | null
          default_upload_channel?: string
          icon_url?: string
          id?: string | null
          last_version?: string | null
          manifest_bundle_count?: number
          name?: string | null
          owner_org?: string
          retention?: number
          transfer_history?: Json[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_org_id_fkey"
            columns: ["owner_org"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      bandwidth_usage: {
        Row: {
          app_id: string
          device_id: string
          file_size: number
          id: number
          timestamp: string
        }
        Insert: {
          app_id: string
          device_id: string
          file_size: number
          id?: number
          timestamp?: string
        }
        Update: {
          app_id?: string
          device_id?: string
          file_size?: number
          id?: number
          timestamp?: string
        }
        Relationships: []
      }
      build_logs: {
        Row: {
          billable_seconds: number
          build_id: string
          build_time_unit: number
          created_at: string
          id: string
          org_id: string
          platform: string
          user_id: string | null
        }
        Insert: {
          billable_seconds: number
          build_id: string
          build_time_unit: number
          created_at?: string
          id?: string
          org_id: string
          platform: string
          user_id?: string | null
        }
        Update: {
          billable_seconds?: number
          build_id?: string
          build_time_unit?: number
          created_at?: string
          id?: string
          org_id?: string
          platform?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "build_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      build_requests: {
        Row: {
          app_id: string
          build_config: Json | null
          build_mode: string
          builder_job_id: string | null
          created_at: string
          id: string
          last_error: string | null
          owner_org: string
          platform: string
          requested_by: string
          status: string
          updated_at: string
          upload_expires_at: string
          upload_path: string
          upload_session_key: string
          upload_url: string
        }
        Insert: {
          app_id: string
          build_config?: Json | null
          build_mode?: string
          builder_job_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          owner_org: string
          platform: string
          requested_by: string
          status?: string
          updated_at?: string
          upload_expires_at: string
          upload_path: string
          upload_session_key: string
          upload_url: string
        }
        Update: {
          app_id?: string
          build_config?: Json | null
          build_mode?: string
          builder_job_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          owner_org?: string
          platform?: string
          requested_by?: string
          status?: string
          updated_at?: string
          upload_expires_at?: string
          upload_path?: string
          upload_session_key?: string
          upload_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_requests_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "build_requests_owner_org_fkey"
            columns: ["owner_org"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      capgo_credits_steps: {
        Row: {
          created_at: string
          id: number
          org_id: string | null
          price_per_unit: number
          step_max: number
          step_min: number
          type: string
          unit_factor: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          org_id?: string | null
          price_per_unit: number
          step_max: number
          step_min: number
          type: string
          unit_factor?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          org_id?: string | null
          price_per_unit?: number
          step_max?: number
          step_min?: number
          type?: string
          unit_factor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capgo_credits_steps_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_devices: {
        Row: {
          app_id: string
          channel_id: number
          created_at: string | null
          device_id: string
          id: number
          owner_org: string
          updated_at: string
        }
        Insert: {
          app_id: string
          channel_id: number
          created_at?: string | null
          device_id: string
          id?: number
          owner_org: string
          updated_at?: string
        }
        Update: {
          app_id?: string
          channel_id?: number
          created_at?: string | null
          device_id?: string
          id?: number
          owner_org?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_devices_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "channel_devices_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_org_id_fkey"
            columns: ["owner_org"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          allow_dev: boolean
          allow_device_self_set: boolean
          allow_emulator: boolean
          android: boolean
          app_id: string
          created_at: string
          created_by: string
          disable_auto_update: Database["public"]["Enums"]["disable_update"]
          disable_auto_update_under_native: boolean
          id: number
          ios: boolean
          name: string
          owner_org: string
          public: boolean
          updated_at: string
          version: number
        }
        Insert: {
          allow_dev?: boolean
          allow_device_self_set?: boolean
          allow_emulator?: boolean
          android?: boolean
          app_id: string
          created_at?: string
          created_by: string
          disable_auto_update?: Database["public"]["Enums"]["disable_update"]
          disable_auto_update_under_native?: boolean
          id?: number
          ios?: boolean
          name: string
          owner_org: string
          public?: boolean
          updated_at?: string
          version: number
        }
        Update: {
          allow_dev?: boolean
          allow_device_self_set?: boolean
          allow_emulator?: boolean
          android?: boolean
          app_id?: string
          created_at?: string
          created_by?: string
          disable_auto_update?: Database["public"]["Enums"]["disable_update"]
          disable_auto_update_under_native?: boolean
          id?: number
          ios?: boolean
          name?: string
          owner_org?: string
          public?: boolean
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "channels_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "channels_version_fkey"
            columns: ["version"]
            isOneToOne: false
            referencedRelation: "app_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_org_id_fkey"
            columns: ["owner_org"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_bandwidth: {
        Row: {
          app_id: string
          bandwidth: number
          date: string
          id: number
        }
        Insert: {
          app_id: string
          bandwidth: number
          date: string
          id?: number
        }
        Update: {
          app_id?: string
          bandwidth?: number
          date?: string
          id?: number
        }
        Relationships: []
      }
      daily_build_time: {
        Row: {
          app_id: string
          build_count: number
          build_time_unit: number
          date: string
        }
        Insert: {
          app_id: string
          build_count?: number
          build_time_unit?: number
          date: string
        }
        Update: {
          app_id?: string
          build_count?: number
          build_time_unit?: number
          date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_build_time_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
        ]
      }
      daily_mau: {
        Row: {
          app_id: string
          date: string
          id: number
          mau: number
        }
        Insert: {
          app_id: string
          date: string
          id?: number
          mau: number
        }
        Update: {
          app_id?: string
          date?: string
          id?: number
          mau?: number
        }
        Relationships: []
      }
      daily_storage: {
        Row: {
          app_id: string
          date: string
          id: number
          storage: number
        }
        Insert: {
          app_id: string
          date: string
          id?: number
          storage: number
        }
        Update: {
          app_id?: string
          date?: string
          id?: number
          storage?: number
        }
        Relationships: []
      }
      daily_version: {
        Row: {
          app_id: string
          date: string
          fail: number | null
          get: number | null
          install: number | null
          uninstall: number | null
          version_id: number
        }
        Insert: {
          app_id: string
          date: string
          fail?: number | null
          get?: number | null
          install?: number | null
          uninstall?: number | null
          version_id: number
        }
        Update: {
          app_id?: string
          date?: string
          fail?: number | null
          get?: number | null
          install?: number | null
          uninstall?: number | null
          version_id?: number
        }
        Relationships: []
      }
      deleted_account: {
        Row: {
          created_at: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string | null
          email?: string
          id?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      deleted_apps: {
        Row: {
          app_id: string
          created_at: string | null
          deleted_at: string | null
          id: number
          owner_org: string
        }
        Insert: {
          app_id: string
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          owner_org: string
        }
        Update: {
          app_id?: string
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          owner_org?: string
        }
        Relationships: []
      }
      deploy_history: {
        Row: {
          app_id: string
          channel_id: number
          created_at: string | null
          created_by: string
          deployed_at: string | null
          id: number
          owner_org: string
          updated_at: string | null
          version_id: number
        }
        Insert: {
          app_id: string
          channel_id: number
          created_at?: string | null
          created_by: string
          deployed_at?: string | null
          id?: number
          owner_org: string
          updated_at?: string | null
          version_id: number
        }
        Update: {
          app_id?: string
          channel_id?: number
          created_at?: string | null
          created_by?: string
          deployed_at?: string | null
          id?: number
          owner_org?: string
          updated_at?: string | null
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "deploy_history_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "deploy_history_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deploy_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deploy_history_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "app_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      device_usage: {
        Row: {
          app_id: string
          device_id: string
          id: number
          org_id: string
          timestamp: string
        }
        Insert: {
          app_id: string
          device_id: string
          id?: number
          org_id: string
          timestamp?: string
        }
        Update: {
          app_id?: string
          device_id?: string
          id?: number
          org_id?: string
          timestamp?: string
        }
        Relationships: []
      }
      devices: {
        Row: {
          app_id: string
          custom_id: string
          default_channel: string | null
          device_id: string
          id: number
          is_emulator: boolean | null
          is_prod: boolean | null
          os_version: string | null
          platform: Database["public"]["Enums"]["platform_os"]
          plugin_version: string
          updated_at: string
          version: number | null
          version_build: string | null
          version_name: string
        }
        Insert: {
          app_id: string
          custom_id?: string
          default_channel?: string | null
          device_id: string
          id?: never
          is_emulator?: boolean | null
          is_prod?: boolean | null
          os_version?: string | null
          platform: Database["public"]["Enums"]["platform_os"]
          plugin_version?: string
          updated_at: string
          version?: number | null
          version_build?: string | null
          version_name?: string
        }
        Update: {
          app_id?: string
          custom_id?: string
          default_channel?: string | null
          device_id?: string
          id?: never
          is_emulator?: boolean | null
          is_prod?: boolean | null
          os_version?: string | null
          platform?: Database["public"]["Enums"]["platform_os"]
          plugin_version?: string
          updated_at?: string
          version?: number | null
          version_build?: string | null
          version_name?: string
        }
        Relationships: []
      }
      global_stats: {
        Row: {
          apps: number
          apps_active: number | null
          bundle_storage_gb: number
          created_at: string | null
          date_id: string
          devices_last_month: number | null
          need_upgrade: number | null
          not_paying: number | null
          onboarded: number | null
          paying: number | null
          paying_monthly: number | null
          paying_yearly: number | null
          plan_maker: number | null
          plan_payg: number | null
          plan_solo: number | null
          plan_team: number | null
          registers_today: number
          stars: number
          success_rate: number | null
          trial: number | null
          updates: number
          updates_external: number | null
          updates_last_month: number | null
          users: number | null
          users_active: number | null
        }
        Insert: {
          apps: number
          apps_active?: number | null
          bundle_storage_gb?: number
          created_at?: string | null
          date_id: string
          devices_last_month?: number | null
          need_upgrade?: number | null
          not_paying?: number | null
          onboarded?: number | null
          paying?: number | null
          paying_monthly?: number | null
          paying_yearly?: number | null
          plan_maker?: number | null
          plan_payg?: number | null
          plan_solo?: number | null
          plan_team?: number | null
          registers_today?: number
          stars: number
          success_rate?: number | null
          trial?: number | null
          updates: number
          updates_external?: number | null
          updates_last_month?: number | null
          users?: number | null
          users_active?: number | null
        }
        Update: {
          apps?: number
          apps_active?: number | null
          bundle_storage_gb?: number
          created_at?: string | null
          date_id?: string
          devices_last_month?: number | null
          need_upgrade?: number | null
          not_paying?: number | null
          onboarded?: number | null
          paying?: number | null
          paying_monthly?: number | null
          paying_yearly?: number | null
          plan_maker?: number | null
          plan_payg?: number | null
          plan_solo?: number | null
          plan_team?: number | null
          registers_today?: number
          stars?: number
          success_rate?: number | null
          trial?: number | null
          updates?: number
          updates_external?: number | null
          updates_last_month?: number | null
          users?: number | null
          users_active?: number | null
        }
        Relationships: []
      }
      manifest: {
        Row: {
          app_version_id: number
          file_hash: string
          file_name: string
          file_size: number | null
          id: number
          s3_path: string
        }
        Insert: {
          app_version_id: number
          file_hash: string
          file_name: string
          file_size?: number | null
          id?: number
          s3_path: string
        }
        Update: {
          app_version_id?: number
          file_hash?: string
          file_name?: string
          file_size?: number | null
          id?: number
          s3_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "manifest_app_version_id_fkey"
            columns: ["app_version_id"]
            isOneToOne: false
            referencedRelation: "app_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          event: string
          last_send_at: string
          owner_org: string
          total_send: number
          uniq_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          event: string
          last_send_at?: string
          owner_org: string
          total_send?: number
          uniq_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          event?: string
          last_send_at?: string
          owner_org?: string
          total_send?: number
          uniq_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_org_id_fkey"
            columns: ["owner_org"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_users: {
        Row: {
          app_id: string | null
          channel_id: number | null
          created_at: string | null
          id: number
          org_id: string
          updated_at: string | null
          user_id: string
          user_right: Database["public"]["Enums"]["user_min_right"] | null
        }
        Insert: {
          app_id?: string | null
          channel_id?: number | null
          created_at?: string | null
          id?: number
          org_id: string
          updated_at?: string | null
          user_id: string
          user_right?: Database["public"]["Enums"]["user_min_right"] | null
        }
        Update: {
          app_id?: string | null
          channel_id?: number | null
          created_at?: string | null
          id?: number
          org_id?: string
          updated_at?: string | null
          user_id?: string
          user_right?: Database["public"]["Enums"]["user_min_right"] | null
        }
        Relationships: [
          {
            foreignKeyName: "org_users_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "org_users_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string | null
          created_by: string
          customer_id: string | null
          id: string
          logo: string | null
          management_email: string
          name: string
          stats_updated_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          customer_id?: string | null
          id?: string
          logo?: string | null
          management_email: string
          name: string
          stats_updated_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          customer_id?: string | null
          id?: string
          logo?: string | null
          management_email?: string
          name?: string
          stats_updated_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orgs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orgs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "stripe_info"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      plans: {
        Row: {
          bandwidth: number
          bandwidth_unit: number | null
          build_time_unit: number
          created_at: string
          description: string
          id: string
          market_desc: string | null
          mau: number
          mau_unit: number | null
          name: string
          price_m: number
          price_m_bandwidth_id: string | null
          price_m_id: string
          price_m_mau_id: string | null
          price_m_storage_id: string | null
          price_y: number
          price_y_id: string
          storage: number
          storage_unit: number | null
          stripe_id: string
          updated_at: string
        }
        Insert: {
          bandwidth: number
          bandwidth_unit?: number | null
          build_time_unit?: number
          created_at?: string
          description?: string
          id?: string
          market_desc?: string | null
          mau?: number
          mau_unit?: number | null
          name?: string
          price_m?: number
          price_m_bandwidth_id?: string | null
          price_m_id: string
          price_m_mau_id?: string | null
          price_m_storage_id?: string | null
          price_y?: number
          price_y_id: string
          storage: number
          storage_unit?: number | null
          stripe_id?: string
          updated_at?: string
        }
        Update: {
          bandwidth?: number
          bandwidth_unit?: number | null
          build_time_unit?: number
          created_at?: string
          description?: string
          id?: string
          market_desc?: string | null
          mau?: number
          mau_unit?: number | null
          name?: string
          price_m?: number
          price_m_bandwidth_id?: string | null
          price_m_id?: string
          price_m_mau_id?: string | null
          price_m_storage_id?: string | null
          price_y?: number
          price_y_id?: string
          storage?: number
          storage_unit?: number | null
          stripe_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stats: {
        Row: {
          action: Database["public"]["Enums"]["stats_action"]
          app_id: string
          created_at: string
          device_id: string
          id: number
          version_name: string
        }
        Insert: {
          action: Database["public"]["Enums"]["stats_action"]
          app_id: string
          created_at: string
          device_id: string
          id?: never
          version_name?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["stats_action"]
          app_id?: string
          created_at?: string
          device_id?: string
          id?: never
          version_name?: string
        }
        Relationships: []
      }
      storage_usage: {
        Row: {
          app_id: string
          device_id: string
          file_size: number
          id: number
          timestamp: string
        }
        Insert: {
          app_id: string
          device_id: string
          file_size: number
          id?: number
          timestamp?: string
        }
        Update: {
          app_id?: string
          device_id?: string
          file_size?: number
          id?: number
          timestamp?: string
        }
        Relationships: []
      }
      stripe_info: {
        Row: {
          bandwidth_exceeded: boolean | null
          build_time_exceeded: boolean | null
          canceled_at: string | null
          created_at: string
          customer_id: string
          id: number
          is_good_plan: boolean | null
          mau_exceeded: boolean | null
          plan_calculated_at: string | null
          plan_usage: number | null
          price_id: string | null
          product_id: string
          status: Database["public"]["Enums"]["stripe_status"] | null
          storage_exceeded: boolean | null
          subscription_anchor_end: string
          subscription_anchor_start: string
          subscription_id: string | null
          subscription_metered: Json
          trial_at: string
          updated_at: string
        }
        Insert: {
          bandwidth_exceeded?: boolean | null
          build_time_exceeded?: boolean | null
          canceled_at?: string | null
          created_at?: string
          customer_id: string
          id?: number
          is_good_plan?: boolean | null
          mau_exceeded?: boolean | null
          plan_calculated_at?: string | null
          plan_usage?: number | null
          price_id?: string | null
          product_id: string
          status?: Database["public"]["Enums"]["stripe_status"] | null
          storage_exceeded?: boolean | null
          subscription_anchor_end?: string
          subscription_anchor_start?: string
          subscription_id?: string | null
          subscription_metered?: Json
          trial_at?: string
          updated_at?: string
        }
        Update: {
          bandwidth_exceeded?: boolean | null
          build_time_exceeded?: boolean | null
          canceled_at?: string | null
          created_at?: string
          customer_id?: string
          id?: number
          is_good_plan?: boolean | null
          mau_exceeded?: boolean | null
          plan_calculated_at?: string | null
          plan_usage?: number | null
          price_id?: string | null
          product_id?: string
          status?: Database["public"]["Enums"]["stripe_status"] | null
          storage_exceeded?: boolean | null
          subscription_anchor_end?: string
          subscription_anchor_start?: string
          subscription_id?: string | null
          subscription_metered?: Json
          trial_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_info_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["stripe_id"]
          },
        ]
      }
      tmp_users: {
        Row: {
          cancelled_at: string | null
          created_at: string
          email: string
          first_name: string
          future_uuid: string
          id: number
          invite_magic_string: string
          last_name: string
          org_id: string
          role: Database["public"]["Enums"]["user_min_right"]
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          email: string
          first_name: string
          future_uuid?: string
          id?: number
          invite_magic_string?: string
          last_name: string
          org_id: string
          role: Database["public"]["Enums"]["user_min_right"]
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          email?: string
          first_name?: string
          future_uuid?: string
          id?: number
          invite_magic_string?: string
          last_name?: string
          org_id?: string
          role?: Database["public"]["Enums"]["user_min_right"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tmp_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      to_delete_accounts: {
        Row: {
          account_id: string
          created_at: string
          id: number
          removal_date: string
          removed_data: Json | null
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: number
          removal_date: string
          removed_data?: Json | null
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: number
          removal_date?: string
          removed_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "to_delete_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_credit_consumptions: {
        Row: {
          applied_at: string
          credits_used: number
          grant_id: string
          id: number
          metric: Database["public"]["Enums"]["credit_metric_type"]
          org_id: string
          overage_event_id: string | null
        }
        Insert: {
          applied_at?: string
          credits_used: number
          grant_id: string
          id?: number
          metric: Database["public"]["Enums"]["credit_metric_type"]
          org_id: string
          overage_event_id?: string | null
        }
        Update: {
          applied_at?: string
          credits_used?: number
          grant_id?: string
          id?: number
          metric?: Database["public"]["Enums"]["credit_metric_type"]
          org_id?: string
          overage_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_credit_consumptions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "usage_credit_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_credit_consumptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_credit_consumptions_overage_event_id_fkey"
            columns: ["overage_event_id"]
            isOneToOne: false
            referencedRelation: "usage_overage_events"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_credit_grants: {
        Row: {
          credits_consumed: number
          credits_total: number
          expires_at: string
          granted_at: string
          id: string
          notes: string | null
          org_id: string
          source: string
          source_ref: Json | null
        }
        Insert: {
          credits_consumed?: number
          credits_total: number
          expires_at?: string
          granted_at?: string
          id?: string
          notes?: string | null
          org_id: string
          source?: string
          source_ref?: Json | null
        }
        Update: {
          credits_consumed?: number
          credits_total?: number
          expires_at?: string
          granted_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          source?: string
          source_ref?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_credit_grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_credit_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          description: string | null
          grant_id: string | null
          id: number
          occurred_at: string
          org_id: string
          source_ref: Json | null
          transaction_type: Database["public"]["Enums"]["credit_transaction_type"]
        }
        Insert: {
          amount: number
          balance_after?: number | null
          description?: string | null
          grant_id?: string | null
          id?: number
          occurred_at?: string
          org_id: string
          source_ref?: Json | null
          transaction_type: Database["public"]["Enums"]["credit_transaction_type"]
        }
        Update: {
          amount?: number
          balance_after?: number | null
          description?: string | null
          grant_id?: string | null
          id?: number
          occurred_at?: string
          org_id?: string
          source_ref?: Json | null
          transaction_type?: Database["public"]["Enums"]["credit_transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "usage_credit_transactions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "usage_credit_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_credit_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_overage_events: {
        Row: {
          billing_cycle_end: string | null
          billing_cycle_start: string | null
          created_at: string
          credit_step_id: number | null
          credits_debited: number
          credits_estimated: number
          details: Json | null
          id: string
          metric: Database["public"]["Enums"]["credit_metric_type"]
          org_id: string
          overage_amount: number
        }
        Insert: {
          billing_cycle_end?: string | null
          billing_cycle_start?: string | null
          created_at?: string
          credit_step_id?: number | null
          credits_debited?: number
          credits_estimated: number
          details?: Json | null
          id?: string
          metric: Database["public"]["Enums"]["credit_metric_type"]
          org_id: string
          overage_amount: number
        }
        Update: {
          billing_cycle_end?: string | null
          billing_cycle_start?: string | null
          created_at?: string
          credit_step_id?: number | null
          credits_debited?: number
          credits_estimated?: number
          details?: Json | null
          id?: string
          metric?: Database["public"]["Enums"]["credit_metric_type"]
          org_id?: string
          overage_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_overage_events_credit_step_id_fkey"
            columns: ["credit_step_id"]
            isOneToOne: false
            referencedRelation: "capgo_credits_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_overage_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          ban_time: string | null
          country: string | null
          created_at: string | null
          email: string
          enable_notifications: boolean
          first_name: string | null
          id: string
          image_url: string | null
          last_name: string | null
          opt_for_newsletters: boolean
          updated_at: string | null
        }
        Insert: {
          ban_time?: string | null
          country?: string | null
          created_at?: string | null
          email: string
          enable_notifications?: boolean
          first_name?: string | null
          id: string
          image_url?: string | null
          last_name?: string | null
          opt_for_newsletters?: boolean
          updated_at?: string | null
        }
        Update: {
          ban_time?: string | null
          country?: string | null
          created_at?: string | null
          email?: string
          enable_notifications?: boolean
          first_name?: string | null
          id?: string
          image_url?: string | null
          last_name?: string | null
          opt_for_newsletters?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
      version_meta: {
        Row: {
          app_id: string
          size: number
          timestamp: string
          version_id: number
        }
        Insert: {
          app_id: string
          size: number
          timestamp?: string
          version_id: number
        }
        Update: {
          app_id?: string
          size?: number
          timestamp?: string
          version_id?: number
        }
        Relationships: []
      }
      version_usage: {
        Row: {
          action: Database["public"]["Enums"]["version_action"]
          app_id: string
          timestamp: string
          version_id: number
        }
        Insert: {
          action: Database["public"]["Enums"]["version_action"]
          app_id: string
          timestamp?: string
          version_id: number
        }
        Update: {
          action?: Database["public"]["Enums"]["version_action"]
          app_id?: string
          timestamp?: string
          version_id?: number
        }
        Relationships: []
      }
    }
    Views: {
      usage_credit_balances: {
        Row: {
          available_credits: number | null
          next_expiration: string | null
          org_id: string | null
          total_credits: number | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_credit_grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation_to_org: { Args: { org_id: string }; Returns: string }
      apply_usage_overage: {
        Args: {
          p_billing_cycle_end: string
          p_billing_cycle_start: string
          p_details?: Json
          p_metric: Database["public"]["Enums"]["credit_metric_type"]
          p_org_id: string
          p_overage_amount: number
        }
        Returns: {
          credit_step_id: number
          credits_applied: number
          credits_remaining: number
          credits_required: number
          overage_amount: number
          overage_covered: number
          overage_event_id: string
          overage_unpaid: number
        }[]
      }
      calculate_credit_cost: {
        Args: {
          p_metric: Database["public"]["Enums"]["credit_metric_type"]
          p_overage_amount: number
        }
        Returns: {
          credit_cost_per_unit: number
          credit_step_id: number
          credits_required: number
        }[]
      }
      check_min_rights:
        | {
            Args: {
              app_id: string
              channel_id: number
              min_right: Database["public"]["Enums"]["user_min_right"]
              org_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              app_id: string
              channel_id: number
              min_right: Database["public"]["Enums"]["user_min_right"]
              org_id: string
              user_id: string
            }
            Returns: boolean
          }
      check_revert_to_builtin_version: {
        Args: { appid: string }
        Returns: number
      }
      cleanup_frequent_job_details: { Args: never; Returns: undefined }
      cleanup_queue_messages: { Args: never; Returns: undefined }
      convert_bytes_to_gb: { Args: { bytes_value: number }; Returns: number }
      convert_bytes_to_mb: { Args: { bytes_value: number }; Returns: number }
      convert_gb_to_bytes: { Args: { gb: number }; Returns: number }
      convert_mb_to_bytes: { Args: { gb: number }; Returns: number }
      convert_number_to_percent: {
        Args: { max_val: number; val: number }
        Returns: number
      }
      count_active_users: { Args: { app_ids: string[] }; Returns: number }
      count_all_need_upgrade: { Args: never; Returns: number }
      count_all_onboarded: { Args: never; Returns: number }
      count_all_plans_v2: {
        Args: never
        Returns: {
          count: number
          plan_name: string
        }[]
      }
      delete_accounts_marked_for_deletion: {
        Args: never
        Returns: {
          deleted_count: number
          deleted_user_ids: string[]
        }[]
      }
      delete_http_response: { Args: { request_id: number }; Returns: undefined }
      delete_old_deleted_apps: { Args: never; Returns: undefined }
      delete_user: { Args: never; Returns: undefined }
      exist_app_v2: { Args: { appid: string }; Returns: boolean }
      exist_app_versions:
        | { Args: { appid: string; name_version: string }; Returns: boolean }
        | {
            Args: { apikey: string; appid: string; name_version: string }
            Returns: boolean
          }
      expire_usage_credits: { Args: never; Returns: number }
      find_best_plan_v3: {
        Args: {
          bandwidth: number
          build_time_unit?: number
          mau: number
          storage: number
        }
        Returns: string
      }
      find_fit_plan_v3: {
        Args: {
          bandwidth: number
          build_time_unit?: number
          mau: number
          storage: number
        }
        Returns: {
          name: string
        }[]
      }
      get_account_removal_date: { Args: { user_id: string }; Returns: string }
      get_apikey: { Args: never; Returns: string }
      get_apikey_header: { Args: never; Returns: string }
      get_app_metrics:
        | {
            Args: { org_id: string }
            Returns: {
              app_id: string
              bandwidth: number
              build_time_unit: number
              date: string
              fail: number
              get: number
              install: number
              mau: number
              storage: number
              uninstall: number
            }[]
          }
        | {
            Args: { end_date: string; org_id: string; start_date: string }
            Returns: {
              app_id: string
              bandwidth: number
              build_time_unit: number
              date: string
              fail: number
              get: number
              install: number
              mau: number
              storage: number
              uninstall: number
            }[]
          }
      get_app_versions: {
        Args: { apikey: string; appid: string; name_version: string }
        Returns: number
      }
      get_current_plan_max_org: {
        Args: { orgid: string }
        Returns: {
          bandwidth: number
          build_time_unit: number
          mau: number
          storage: number
        }[]
      }
      get_current_plan_name_org: { Args: { orgid: string }; Returns: string }
      get_customer_counts: {
        Args: never
        Returns: {
          monthly: number
          total: number
          yearly: number
        }[]
      }
      get_cycle_info_org: {
        Args: { orgid: string }
        Returns: {
          subscription_anchor_end: string
          subscription_anchor_start: string
        }[]
      }
      get_d1_sync_url: { Args: never; Returns: string }
      get_d1_webhook_signature: { Args: never; Returns: string }
      get_db_url: { Args: never; Returns: string }
      get_global_metrics:
        | {
            Args: { org_id: string }
            Returns: {
              bandwidth: number
              date: string
              fail: number
              get: number
              install: number
              mau: number
              storage: number
              uninstall: number
            }[]
          }
        | {
            Args: { end_date: string; org_id: string; start_date: string }
            Returns: {
              bandwidth: number
              date: string
              fail: number
              get: number
              install: number
              mau: number
              storage: number
              uninstall: number
            }[]
          }
      get_identity:
        | { Args: never; Returns: string }
        | {
            Args: { keymode: Database["public"]["Enums"]["key_mode"][] }
            Returns: string
          }
      get_identity_apikey_only: {
        Args: { keymode: Database["public"]["Enums"]["key_mode"][] }
        Returns: string
      }
      get_identity_org_allowed: {
        Args: {
          keymode: Database["public"]["Enums"]["key_mode"][]
          org_id: string
        }
        Returns: string
      }
      get_identity_org_appid: {
        Args: {
          app_id: string
          keymode: Database["public"]["Enums"]["key_mode"][]
          org_id: string
        }
        Returns: string
      }
      get_invite_by_magic_lookup: {
        Args: { lookup: string }
        Returns: {
          org_logo: string
          org_name: string
          role: Database["public"]["Enums"]["user_min_right"]
        }[]
      }
      get_metered_usage:
        | {
            Args: { orgid: string }
            Returns: Database["public"]["CompositeTypes"]["stats_table"]
            SetofOptions: {
              from: "*"
              to: "stats_table"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: never
            Returns: Database["public"]["CompositeTypes"]["stats_table"]
            SetofOptions: {
              from: "*"
              to: "stats_table"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      get_next_cron_time: {
        Args: { p_schedule: string; p_timestamp: string }
        Returns: string
      }
      get_next_cron_value: {
        Args: { current_val: number; max_val: number; pattern: string }
        Returns: number
      }
      get_next_stats_update_date: { Args: { org: string }; Returns: string }
      get_org_build_time_unit: {
        Args: { p_end_date: string; p_org_id: string; p_start_date: string }
        Returns: {
          total_build_time_unit: number
          total_builds: number
        }[]
      }
      get_org_members:
        | {
            Args: { guild_id: string; user_id: string }
            Returns: {
              aid: number
              email: string
              image_url: string
              is_tmp: boolean
              role: Database["public"]["Enums"]["user_min_right"]
              uid: string
            }[]
          }
        | {
            Args: { guild_id: string }
            Returns: {
              aid: number
              email: string
              image_url: string
              is_tmp: boolean
              role: Database["public"]["Enums"]["user_min_right"]
              uid: string
            }[]
          }
      get_org_owner_id: {
        Args: { apikey: string; app_id: string }
        Returns: string
      }
      get_org_perm_for_apikey: {
        Args: { apikey: string; app_id: string }
        Returns: string
      }
      get_organization_cli_warnings: {
        Args: { cli_version: string; orgid: string }
        Returns: Json[]
      }
      get_orgs_v6:
        | {
            Args: never
            Returns: {
              app_count: number
              can_use_more: boolean
              created_by: string
              credit_available: number
              credit_next_expiration: string
              credit_total: number
              gid: string
              is_canceled: boolean
              is_yearly: boolean
              logo: string
              management_email: string
              name: string
              next_stats_update_at: string
              paying: boolean
              role: string
              stats_updated_at: string
              subscription_end: string
              subscription_start: string
              trial_left: number
            }[]
          }
        | {
            Args: { userid: string }
            Returns: {
              app_count: number
              can_use_more: boolean
              created_by: string
              credit_available: number
              credit_next_expiration: string
              credit_total: number
              gid: string
              is_canceled: boolean
              is_yearly: boolean
              logo: string
              management_email: string
              name: string
              next_stats_update_at: string
              paying: boolean
              role: string
              stats_updated_at: string
              subscription_end: string
              subscription_start: string
              trial_left: number
            }[]
          }
      get_plan_usage_percent_detailed:
        | {
            Args: { orgid: string }
            Returns: {
              bandwidth_percent: number
              build_time_percent: number
              mau_percent: number
              storage_percent: number
              total_percent: number
            }[]
          }
        | {
            Args: { cycle_end: string; cycle_start: string; orgid: string }
            Returns: {
              bandwidth_percent: number
              build_time_percent: number
              mau_percent: number
              storage_percent: number
              total_percent: number
            }[]
          }
      get_process_cron_stats_job_info: {
        Args: never
        Returns: {
          last_run: string
          next_run: string
        }[]
      }
      get_total_app_storage_size_orgs: {
        Args: { app_id: string; org_id: string }
        Returns: number
      }
      get_total_metrics:
        | {
            Args: { org_id: string }
            Returns: {
              bandwidth: number
              build_time_unit: number
              fail: number
              get: number
              install: number
              mau: number
              storage: number
              uninstall: number
            }[]
          }
        | {
            Args: { end_date: string; org_id: string; start_date: string }
            Returns: {
              bandwidth: number
              build_time_unit: number
              fail: number
              get: number
              install: number
              mau: number
              storage: number
              uninstall: number
            }[]
          }
      get_total_storage_size_org: { Args: { org_id: string }; Returns: number }
      get_update_stats: {
        Args: never
        Returns: {
          app_id: string
          failed: number
          get: number
          healthy: boolean
          install: number
          success_rate: number
        }[]
      }
      get_user_id:
        | { Args: { apikey: string; app_id: string }; Returns: string }
        | { Args: { apikey: string }; Returns: string }
      get_user_main_org_id: { Args: { user_id: string }; Returns: string }
      get_user_main_org_id_by_app_id: {
        Args: { app_id: string }
        Returns: string
      }
      get_versions_with_no_metadata: {
        Args: never
        Returns: {
          app_id: string
          checksum: string | null
          comment: string | null
          created_at: string | null
          deleted: boolean
          external_url: string | null
          id: number
          link: string | null
          manifest:
            | Database["public"]["CompositeTypes"]["manifest_entry"][]
            | null
          min_update_version: string | null
          name: string
          native_packages: Json[] | null
          owner_org: string
          r2_path: string | null
          session_key: string | null
          storage_provider: string
          updated_at: string | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "app_versions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_weekly_stats: {
        Args: { app_id: string }
        Returns: {
          all_updates: number
          failed_updates: number
          open_app: number
        }[]
      }
      has_app_right: {
        Args: {
          appid: string
          right: Database["public"]["Enums"]["user_min_right"]
        }
        Returns: boolean
      }
      has_app_right_apikey: {
        Args: {
          apikey: string
          appid: string
          right: Database["public"]["Enums"]["user_min_right"]
          userid: string
        }
        Returns: boolean
      }
      has_app_right_userid: {
        Args: {
          appid: string
          right: Database["public"]["Enums"]["user_min_right"]
          userid: string
        }
        Returns: boolean
      }
      invite_user_to_org: {
        Args: {
          email: string
          invite_type: Database["public"]["Enums"]["user_min_right"]
          org_id: string
        }
        Returns: string
      }
      is_account_disabled: { Args: { user_id: string }; Returns: boolean }
      is_admin:
        | { Args: { userid: string }; Returns: boolean }
        | { Args: never; Returns: boolean }
      is_allowed_action: {
        Args: { apikey: string; appid: string }
        Returns: boolean
      }
      is_allowed_action_org: { Args: { orgid: string }; Returns: boolean }
      is_allowed_action_org_action: {
        Args: {
          actions: Database["public"]["Enums"]["action_type"][]
          orgid: string
        }
        Returns: boolean
      }
      is_allowed_capgkey:
        | {
            Args: {
              apikey: string
              keymode: Database["public"]["Enums"]["key_mode"][]
            }
            Returns: boolean
          }
        | {
            Args: {
              apikey: string
              app_id: string
              keymode: Database["public"]["Enums"]["key_mode"][]
            }
            Returns: boolean
          }
      is_app_owner:
        | { Args: { apikey: string; appid: string }; Returns: boolean }
        | { Args: { appid: string; userid: string }; Returns: boolean }
        | { Args: { appid: string }; Returns: boolean }
      is_bandwidth_exceeded_by_org: {
        Args: { org_id: string }
        Returns: boolean
      }
      is_build_time_exceeded_by_org: {
        Args: { org_id: string }
        Returns: boolean
      }
      is_canceled_org: { Args: { orgid: string }; Returns: boolean }
      is_good_plan_v5_org: { Args: { orgid: string }; Returns: boolean }
      is_mau_exceeded_by_org: { Args: { org_id: string }; Returns: boolean }
      is_member_of_org: {
        Args: { org_id: string; user_id: string }
        Returns: boolean
      }
      is_not_deleted: { Args: { email_check: string }; Returns: boolean }
      is_numeric: { Args: { "": string }; Returns: boolean }
      is_onboarded_org: { Args: { orgid: string }; Returns: boolean }
      is_onboarding_needed_org: { Args: { orgid: string }; Returns: boolean }
      is_org_yearly: { Args: { orgid: string }; Returns: boolean }
      is_owner_of_org: {
        Args: { org_id: string; user_id: string }
        Returns: boolean
      }
      is_paying_and_good_plan_org: { Args: { orgid: string }; Returns: boolean }
      is_paying_and_good_plan_org_action: {
        Args: {
          actions: Database["public"]["Enums"]["action_type"][]
          orgid: string
        }
        Returns: boolean
      }
      is_paying_org: { Args: { orgid: string }; Returns: boolean }
      is_storage_exceeded_by_org: { Args: { org_id: string }; Returns: boolean }
      is_trial_org: { Args: { orgid: string }; Returns: number }
      mass_edit_queue_messages_cf_ids: {
        Args: {
          updates: Database["public"]["CompositeTypes"]["message_update"][]
        }
        Returns: undefined
      }
      modify_permissions_tmp: {
        Args: {
          email: string
          new_role: Database["public"]["Enums"]["user_min_right"]
          org_id: string
        }
        Returns: string
      }
      one_month_ahead: { Args: never; Returns: string }
      parse_cron_field: {
        Args: { current_val: number; field: string; max_val: number }
        Returns: number
      }
      parse_step_pattern: { Args: { pattern: string }; Returns: number }
      pg_log: { Args: { decision: string; input?: Json }; Returns: undefined }
      process_admin_stats: { Args: never; Returns: undefined }
      process_all_cron_tasks: { Args: never; Returns: undefined }
      process_channel_device_counts_queue: {
        Args: { batch_size?: number }
        Returns: number
      }
      process_cron_stats_jobs: { Args: never; Returns: undefined }
      process_cron_sync_sub_jobs: { Args: never; Returns: undefined }
      process_d1_replication_batch: { Args: never; Returns: undefined }
      process_failed_uploads: { Args: never; Returns: undefined }
      process_free_trial_expired: { Args: never; Returns: undefined }
      process_function_queue:
        | {
            Args: { batch_size?: number; queue_names: string[] }
            Returns: undefined
          }
        | {
            Args: { batch_size?: number; queue_name: string }
            Returns: undefined
          }
      process_manifest_bundle_counts_queue: {
        Args: { batch_size?: number }
        Returns: number
      }
      process_stats_email_monthly: { Args: never; Returns: undefined }
      process_stats_email_weekly: { Args: never; Returns: undefined }
      process_subscribed_orgs: { Args: never; Returns: undefined }
      queue_cron_stat_org_for_org: {
        Args: { customer_id: string; org_id: string }
        Returns: undefined
      }
      read_bandwidth_usage: {
        Args: { p_app_id: string; p_period_end: string; p_period_start: string }
        Returns: {
          app_id: string
          bandwidth: number
          date: string
        }[]
      }
      read_device_usage: {
        Args: { p_app_id: string; p_period_end: string; p_period_start: string }
        Returns: {
          app_id: string
          date: string
          mau: number
        }[]
      }
      read_storage_usage: {
        Args: { p_app_id: string; p_period_end: string; p_period_start: string }
        Returns: {
          app_id: string
          date: string
          storage: number
        }[]
      }
      read_version_usage: {
        Args: { p_app_id: string; p_period_end: string; p_period_start: string }
        Returns: {
          app_id: string
          date: string
          fail: number
          get: number
          install: number
          uninstall: number
          version_id: number
        }[]
      }
      record_build_time: {
        Args: {
          p_build_id: string
          p_build_time_unit: number
          p_org_id: string
          p_platform: string
          p_user_id: string
        }
        Returns: string
      }
      remove_old_jobs: { Args: never; Returns: undefined }
      rescind_invitation: {
        Args: { email: string; org_id: string }
        Returns: string
      }
      seed_get_app_metrics_caches: {
        Args: { p_end_date: string; p_org_id: string; p_start_date: string }
        Returns: {
          cached_at: string
          end_date: string
          id: number
          org_id: string
          response: Json
          start_date: string
        }
        SetofOptions: {
          from: "*"
          to: "app_metrics_cache"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_bandwidth_exceeded_by_org: {
        Args: { disabled: boolean; org_id: string }
        Returns: undefined
      }
      set_build_time_exceeded_by_org: {
        Args: { disabled: boolean; org_id: string }
        Returns: undefined
      }
      set_mau_exceeded_by_org: {
        Args: { disabled: boolean; org_id: string }
        Returns: undefined
      }
      set_storage_exceeded_by_org: {
        Args: { disabled: boolean; org_id: string }
        Returns: undefined
      }
      total_bundle_storage_bytes: { Args: never; Returns: number }
      transfer_app: {
        Args: { p_app_id: string; p_new_org_id: string }
        Returns: undefined
      }
      transform_role_to_invite: {
        Args: { role_input: Database["public"]["Enums"]["user_min_right"] }
        Returns: Database["public"]["Enums"]["user_min_right"]
      }
      transform_role_to_non_invite: {
        Args: { role_input: Database["public"]["Enums"]["user_min_right"] }
        Returns: Database["public"]["Enums"]["user_min_right"]
      }
      update_app_versions_retention: { Args: never; Returns: undefined }
      upsert_version_meta: {
        Args: { p_app_id: string; p_size: number; p_version_id: number }
        Returns: boolean
      }
      verify_mfa: { Args: never; Returns: boolean }
    }
    Enums: {
      action_type: "mau" | "storage" | "bandwidth" | "build_time"
      app_mode: "prod" | "dev" | "livereload"
      credit_metric_type: "mau" | "bandwidth" | "storage" | "build_time"
      credit_transaction_type:
        | "grant"
        | "purchase"
        | "manual_grant"
        | "deduction"
        | "expiry"
        | "refund"
      disable_update: "major" | "minor" | "patch" | "version_number" | "none"
      key_mode: "read" | "write" | "all" | "upload"
      pay_as_you_go_type: "base" | "units"
      platform_os: "ios" | "android"
      stats_action:
        | "delete"
        | "reset"
        | "set"
        | "get"
        | "set_fail"
        | "update_fail"
        | "download_fail"
        | "windows_path_fail"
        | "canonical_path_fail"
        | "directory_path_fail"
        | "unzip_fail"
        | "low_mem_fail"
        | "download_10"
        | "download_20"
        | "download_30"
        | "download_40"
        | "download_50"
        | "download_60"
        | "download_70"
        | "download_80"
        | "download_90"
        | "download_complete"
        | "decrypt_fail"
        | "app_moved_to_foreground"
        | "app_moved_to_background"
        | "uninstall"
        | "needPlanUpgrade"
        | "missingBundle"
        | "noNew"
        | "disablePlatformIos"
        | "disablePlatformAndroid"
        | "disableAutoUpdateToMajor"
        | "cannotUpdateViaPrivateChannel"
        | "disableAutoUpdateToMinor"
        | "disableAutoUpdateToPatch"
        | "channelMisconfigured"
        | "disableAutoUpdateMetadata"
        | "disableAutoUpdateUnderNative"
        | "disableDevBuild"
        | "disableEmulator"
        | "cannotGetBundle"
        | "checksum_fail"
        | "NoChannelOrOverride"
        | "setChannel"
        | "getChannel"
        | "rateLimited"
        | "disableAutoUpdate"
        | "ping"
        | "InvalidIp"
        | "blocked_by_server_url"
        | "download_manifest_start"
        | "download_manifest_complete"
        | "download_zip_start"
        | "download_zip_complete"
        | "download_manifest_file_fail"
        | "download_manifest_checksum_fail"
        | "download_manifest_brotli_fail"
        | "backend_refusal"
      stripe_status:
        | "created"
        | "succeeded"
        | "updated"
        | "failed"
        | "deleted"
        | "canceled"
      usage_mode: "5min" | "day" | "month" | "cycle" | "last_saved"
      user_min_right:
        | "invite_read"
        | "invite_upload"
        | "invite_write"
        | "invite_admin"
        | "invite_super_admin"
        | "read"
        | "upload"
        | "write"
        | "admin"
        | "super_admin"
      user_role: "read" | "upload" | "write" | "admin"
      version_action: "get" | "fail" | "install" | "uninstall"
    }
    CompositeTypes: {
      manifest_entry: {
        file_name: string | null
        s3_path: string | null
        file_hash: string | null
      }
      match_plan: {
        name: string | null
      }
      message_update: {
        msg_id: number | null
        cf_id: string | null
        queue: string | null
      }
      orgs_table: {
        id: string | null
        created_by: string | null
        created_at: string | null
        updated_at: string | null
        logo: string | null
        name: string | null
      }
      owned_orgs: {
        id: string | null
        created_by: string | null
        logo: string | null
        name: string | null
        role: string | null
      }
      stats_table: {
        mau: number | null
        bandwidth: number | null
        storage: number | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      action_type: ["mau", "storage", "bandwidth", "build_time"],
      app_mode: ["prod", "dev", "livereload"],
      credit_metric_type: ["mau", "bandwidth", "storage", "build_time"],
      credit_transaction_type: [
        "grant",
        "purchase",
        "manual_grant",
        "deduction",
        "expiry",
        "refund",
      ],
      disable_update: ["major", "minor", "patch", "version_number", "none"],
      key_mode: ["read", "write", "all", "upload"],
      pay_as_you_go_type: ["base", "units"],
      platform_os: ["ios", "android"],
      stats_action: [
        "delete",
        "reset",
        "set",
        "get",
        "set_fail",
        "update_fail",
        "download_fail",
        "windows_path_fail",
        "canonical_path_fail",
        "directory_path_fail",
        "unzip_fail",
        "low_mem_fail",
        "download_10",
        "download_20",
        "download_30",
        "download_40",
        "download_50",
        "download_60",
        "download_70",
        "download_80",
        "download_90",
        "download_complete",
        "decrypt_fail",
        "app_moved_to_foreground",
        "app_moved_to_background",
        "uninstall",
        "needPlanUpgrade",
        "missingBundle",
        "noNew",
        "disablePlatformIos",
        "disablePlatformAndroid",
        "disableAutoUpdateToMajor",
        "cannotUpdateViaPrivateChannel",
        "disableAutoUpdateToMinor",
        "disableAutoUpdateToPatch",
        "channelMisconfigured",
        "disableAutoUpdateMetadata",
        "disableAutoUpdateUnderNative",
        "disableDevBuild",
        "disableEmulator",
        "cannotGetBundle",
        "checksum_fail",
        "NoChannelOrOverride",
        "setChannel",
        "getChannel",
        "rateLimited",
        "disableAutoUpdate",
        "ping",
        "InvalidIp",
        "blocked_by_server_url",
        "download_manifest_start",
        "download_manifest_complete",
        "download_zip_start",
        "download_zip_complete",
        "download_manifest_file_fail",
        "download_manifest_checksum_fail",
        "download_manifest_brotli_fail",
        "backend_refusal",
      ],
      stripe_status: [
        "created",
        "succeeded",
        "updated",
        "failed",
        "deleted",
        "canceled",
      ],
      usage_mode: ["5min", "day", "month", "cycle", "last_saved"],
      user_min_right: [
        "invite_read",
        "invite_upload",
        "invite_write",
        "invite_admin",
        "invite_super_admin",
        "read",
        "upload",
        "write",
        "admin",
        "super_admin",
      ],
      user_role: ["read", "upload", "write", "admin"],
      version_action: ["get", "fail", "install", "uninstall"],
    },
  },
} as const
