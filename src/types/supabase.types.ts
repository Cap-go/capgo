export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
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
          devices: number | null
          fails: number | null
          id: number
          installs: number | null
          owner_org: string
          size: number
          uninstalls: number | null
          updated_at: string | null
        }
        Insert: {
          app_id: string
          checksum: string
          created_at?: string | null
          devices?: number | null
          fails?: number | null
          id?: number
          installs?: number | null
          owner_org: string
          size: number
          uninstalls?: number | null
          updated_at?: string | null
        }
        Update: {
          app_id?: string
          checksum?: string
          created_at?: string | null
          devices?: number | null
          fails?: number | null
          id?: number
          installs?: number | null
          owner_org?: string
          size?: number
          uninstalls?: number | null
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
          created_at: string | null
          default_upload_channel: string
          icon_url: string
          id: string | null
          last_version: string | null
          name: string | null
          owner_org: string
          retention: number
          transfer_history: Json[] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          app_id: string
          created_at?: string | null
          default_upload_channel?: string
          icon_url: string
          id?: string | null
          last_version?: string | null
          name?: string | null
          owner_org: string
          retention?: number
          transfer_history?: Json[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          app_id?: string
          created_at?: string | null
          default_upload_channel?: string
          icon_url?: string
          id?: string | null
          last_version?: string | null
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
      capgo_credits_steps: {
        Row: {
          created_at: string
          id: number
          price_per_unit: number
          step_max: number
          step_min: number
          stripe_id: string | null
          type: string
          unit_factor: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          price_per_unit: number
          step_max: number
          step_min: number
          stripe_id?: string | null
          type: string
          unit_factor?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          price_per_unit?: number
          step_max?: number
          step_min?: number
          stripe_id?: string | null
          type?: string
          unit_factor?: number
          updated_at?: string
        }
        Relationships: []
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
          timestamp: string
        }
        Insert: {
          app_id: string
          device_id: string
          id?: number
          timestamp?: string
        }
        Update: {
          app_id?: string
          device_id?: string
          id?: number
          timestamp?: string
        }
        Relationships: []
      }
      devices: {
        Row: {
          app_id: string
          custom_id: string
          device_id: string
          id: number
          is_emulator: boolean | null
          is_prod: boolean | null
          os_version: string | null
          platform: Database["public"]["Enums"]["platform_os"]
          plugin_version: string
          updated_at: string
          version: number
          version_build: string | null
        }
        Insert: {
          app_id: string
          custom_id?: string
          device_id: string
          id?: never
          is_emulator?: boolean | null
          is_prod?: boolean | null
          os_version?: string | null
          platform: Database["public"]["Enums"]["platform_os"]
          plugin_version?: string
          updated_at: string
          version: number
          version_build?: string | null
        }
        Update: {
          app_id?: string
          custom_id?: string
          device_id?: string
          id?: never
          is_emulator?: boolean | null
          is_prod?: boolean | null
          os_version?: string | null
          platform?: Database["public"]["Enums"]["platform_os"]
          plugin_version?: string
          updated_at?: string
          version?: number
          version_build?: string | null
        }
        Relationships: []
      }
      global_stats: {
        Row: {
          apps: number
          apps_active: number | null
          created_at: string | null
          date_id: string
          devices_last_month: number | null
          need_upgrade: number | null
          not_paying: number | null
          onboarded: number | null
          paying: number | null
          paying_monthly: number | null
          paying_yearly: number | null
          stars: number
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
          created_at?: string | null
          date_id: string
          devices_last_month?: number | null
          need_upgrade?: number | null
          not_paying?: number | null
          onboarded?: number | null
          paying?: number | null
          paying_monthly?: number | null
          paying_yearly?: number | null
          stars: number
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
          created_at?: string | null
          date_id?: string
          devices_last_month?: number | null
          need_upgrade?: number | null
          not_paying?: number | null
          onboarded?: number | null
          paying?: number | null
          paying_monthly?: number | null
          paying_yearly?: number | null
          stars?: number
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
          version: number
        }
        Insert: {
          action: Database["public"]["Enums"]["stats_action"]
          app_id: string
          created_at: string
          device_id: string
          id?: never
          version: number
        }
        Update: {
          action?: Database["public"]["Enums"]["stats_action"]
          app_id?: string
          created_at?: string
          device_id?: string
          id?: never
          version?: number
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
          canceled_at: string | null
          created_at: string
          customer_id: string
          id: number
          is_good_plan: boolean | null
          mau_exceeded: boolean | null
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
          canceled_at?: string | null
          created_at?: string
          customer_id: string
          id?: number
          is_good_plan?: boolean | null
          mau_exceeded?: boolean | null
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
          canceled_at?: string | null
          created_at?: string
          customer_id?: string
          id?: number
          is_good_plan?: boolean | null
          mau_exceeded?: boolean | null
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
      users: {
        Row: {
          ban_time: string | null
          billing_email: string | null
          country: string | null
          created_at: string | null
          customer_id: string | null
          email: string
          enableNotifications: boolean
          first_name: string | null
          id: string
          image_url: string | null
          last_name: string | null
          legalAccepted: boolean
          optForNewsletters: boolean
          updated_at: string | null
        }
        Insert: {
          ban_time?: string | null
          billing_email?: string | null
          country?: string | null
          created_at?: string | null
          customer_id?: string | null
          email: string
          enableNotifications?: boolean
          first_name?: string | null
          id: string
          image_url?: string | null
          last_name?: string | null
          legalAccepted?: boolean
          optForNewsletters?: boolean
          updated_at?: string | null
        }
        Update: {
          ban_time?: string | null
          billing_email?: string | null
          country?: string | null
          created_at?: string | null
          customer_id?: string | null
          email?: string
          enableNotifications?: boolean
          first_name?: string | null
          id?: string
          image_url?: string | null
          last_name?: string | null
          legalAccepted?: boolean
          optForNewsletters?: boolean
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "stripe_info"
            referencedColumns: ["customer_id"]
          },
        ]
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
      [_ in never]: never
    }
    Functions: {
      accept_invitation_to_org: {
        Args: { org_id: string }
        Returns: string
      }
      check_min_rights: {
        Args:
          | {
              min_right: Database["public"]["Enums"]["user_min_right"]
              org_id: string
              app_id: string
              channel_id: number
            }
          | {
              min_right: Database["public"]["Enums"]["user_min_right"]
              user_id: string
              org_id: string
              app_id: string
              channel_id: number
            }
        Returns: boolean
      }
      check_revert_to_builtin_version: {
        Args: { appid: string }
        Returns: number
      }
      cleanup_frequent_job_details: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_queue_messages: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      convert_bytes_to_gb: {
        Args: { byt: number }
        Returns: number
      }
      convert_bytes_to_mb: {
        Args: { byt: number }
        Returns: number
      }
      convert_gb_to_bytes: {
        Args: { gb: number }
        Returns: number
      }
      convert_mb_to_bytes: {
        Args: { gb: number }
        Returns: number
      }
      convert_number_to_percent: {
        Args: { val: number; max_val: number }
        Returns: number
      }
      count_active_users: {
        Args: { app_ids: string[] }
        Returns: number
      }
      count_all_need_upgrade: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      count_all_onboarded: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      count_all_plans_v2: {
        Args: Record<PropertyKey, never>
        Returns: {
          plan_name: string
          count: number
        }[]
      }
      delete_http_response: {
        Args: { request_id: number }
        Returns: undefined
      }
      delete_old_deleted_apps: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      delete_user: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      exist_app_v2: {
        Args: { appid: string }
        Returns: boolean
      }
      exist_app_versions: {
        Args:
          | { appid: string; name_version: string }
          | { appid: string; name_version: string; apikey: string }
        Returns: boolean
      }
      find_best_plan_v3: {
        Args: { mau: number; bandwidth: number; storage: number }
        Returns: string
      }
      find_fit_plan_v3: {
        Args: { mau: number; bandwidth: number; storage: number }
        Returns: {
          name: string
        }[]
      }
      get_apikey: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_app_metrics: {
        Args:
          | { org_id: string }
          | { org_id: string; start_date: string; end_date: string }
        Returns: {
          app_id: string
          date: string
          mau: number
          storage: number
          bandwidth: number
          get: number
          fail: number
          install: number
          uninstall: number
        }[]
      }
      get_app_versions: {
        Args: { appid: string; name_version: string; apikey: string }
        Returns: number
      }
      get_current_plan_max_org: {
        Args: { orgid: string }
        Returns: {
          mau: number
          bandwidth: number
          storage: number
        }[]
      }
      get_current_plan_name_org: {
        Args: { orgid: string }
        Returns: string
      }
      get_customer_counts: {
        Args: Record<PropertyKey, never>
        Returns: {
          yearly: number
          monthly: number
          total: number
        }[]
      }
      get_cycle_info_org: {
        Args: { orgid: string }
        Returns: {
          subscription_anchor_start: string
          subscription_anchor_end: string
        }[]
      }
      get_d1_webhook_signature: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_db_url: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_global_metrics: {
        Args:
        | { org_id: string }
        | { org_id: string; start_date: string; end_date: string }
        Returns: {
          date: string
          mau: number
          storage: number
          bandwidth: number
          get: number
          fail: number
          install: number
          uninstall: number
        }[]
      }
      get_identity: {
        Args:
        | Record<PropertyKey, never>
        | { keymode: Database["public"]["Enums"]["key_mode"][] }
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
          keymode: Database["public"]["Enums"]["key_mode"][]
          org_id: string
          app_id: string
        }
        Returns: string
      }
      get_invite_by_magic_lookup: {
        Args: { lookup: string }
        Returns: {
          org_name: string
          org_logo: string
          role: Database["public"]["Enums"]["user_min_right"]
        }[]
      }
      get_metered_usage: {
        Args: Record<PropertyKey, never> | { orgid: string }
        Returns: Database["public"]["CompositeTypes"]["stats_table"]
      }
      get_next_cron_time: {
        Args: { p_schedule: string; p_timestamp: string }
        Returns: string
      }
      get_next_cron_value: {
        Args: { pattern: string; current_val: number; max_val: number }
        Returns: number
      }
      get_org_members: {
        Args: { guild_id: string } | { user_id: string; guild_id: string }
        Returns: {
          aid: number
          uid: string
          email: string
          image_url: string
          role: Database["public"]["Enums"]["user_min_right"]
          is_tmp: boolean
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
        Args: { orgid: string; cli_version: string }
        Returns: Json[]
      }
      get_orgs_v6: {
        Args: Record<PropertyKey, never> | { userid: string }
        Returns: {
          gid: string
          created_by: string
          logo: string
          name: string
          role: string
          paying: boolean
          trial_left: number
          can_use_more: boolean
          is_canceled: boolean
          app_count: number
          subscription_start: string
          subscription_end: string
          management_email: string
          is_yearly: boolean
        }[]
      }
      get_plan_usage_percent_detailed: {
        Args:
        | { orgid: string }
        | { orgid: string; cycle_start: string; cycle_end: string }
        Returns: {
          total_percent: number
          mau_percent: number
          bandwidth_percent: number
          storage_percent: number
        }[]
      }
      get_process_cron_stats_job_info: {
        Args: Record<PropertyKey, never>
        Returns: {
          last_run: string
          next_run: string
        }[]
      }
      get_total_app_storage_size_orgs: {
        Args: { org_id: string; app_id: string }
        Returns: number
      }
      get_total_metrics: {
        Args:
        | { org_id: string }
        | { org_id: string; start_date: string; end_date: string }
        Returns: {
          mau: number
          storage: number
          bandwidth: number
          get: number
          fail: number
          install: number
          uninstall: number
        }[]
      }
      get_total_storage_size_org: {
        Args: { org_id: string }
        Returns: number
      }
      get_update_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          app_id: string
          failed: number
          install: number
          get: number
          success_rate: number
          healthy: boolean
        }[]
      }
      get_user_id: {
        Args: { apikey: string } | { apikey: string; app_id: string }
        Returns: string
      }
      get_user_main_org_id: {
        Args: { user_id: string }
        Returns: string
      }
      get_user_main_org_id_by_app_id: {
        Args: { app_id: string }
        Returns: string
      }
      get_versions_with_no_metadata: {
        Args: Record<PropertyKey, never>
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
          appid: string
          right: Database["public"]["Enums"]["user_min_right"]
          userid: string
          apikey: string
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
          org_id: string
          invite_type: Database["public"]["Enums"]["user_min_right"]
        }
        Returns: string
      }
      is_admin: {
        Args: Record<PropertyKey, never> | { userid: string }
        Returns: boolean
      }
      is_allowed_action: {
        Args: { apikey: string; appid: string }
        Returns: boolean
      }
      is_allowed_action_org: {
        Args: { orgid: string }
        Returns: boolean
      }
      is_allowed_action_org_action: {
        Args: {
          orgid: string
          actions: Database["public"]["Enums"]["action_type"][]
        }
        Returns: boolean
      }
      is_allowed_capgkey: {
        Args:
          | {
              apikey: string
              keymode: Database["public"]["Enums"]["key_mode"][]
            }
          | {
              apikey: string
              keymode: Database["public"]["Enums"]["key_mode"][]
              app_id: string
            }
        Returns: boolean
      }
      is_app_owner: {
        Args:
          | { apikey: string; appid: string }
          | { appid: string }
          | { userid: string; appid: string }
        Returns: boolean
      }
      is_bandwidth_exceeded_by_org: {
        Args: { org_id: string }
        Returns: boolean
      }
      is_canceled_org: {
        Args: { orgid: string }
        Returns: boolean
      }
      is_good_plan_v5_org: {
        Args: { orgid: string }
        Returns: boolean
      }
      is_mau_exceeded_by_org: {
        Args: { org_id: string }
        Returns: boolean
      }
      is_member_of_org: {
        Args: { user_id: string; org_id: string }
        Returns: boolean
      }
      is_not_deleted: {
        Args: { email_check: string }
        Returns: boolean
      }
      is_numeric: {
        Args: { "": string }
        Returns: boolean
      }
      is_onboarded_org: {
        Args: { orgid: string }
        Returns: boolean
      }
      is_onboarding_needed_org: {
        Args: { orgid: string }
        Returns: boolean
      }
      is_org_yearly: {
        Args: { orgid: string }
        Returns: boolean
      }
      is_owner_of_org: {
        Args: { user_id: string; org_id: string }
        Returns: boolean
      }
      is_paying_and_good_plan_org: {
        Args: { orgid: string }
        Returns: boolean
      }
      is_paying_and_good_plan_org_action: {
        Args: {
          orgid: string
          actions: Database["public"]["Enums"]["action_type"][]
        }
        Returns: boolean
      }
      is_paying_org: {
        Args: { orgid: string }
        Returns: boolean
      }
      is_storage_exceeded_by_org: {
        Args: { org_id: string }
        Returns: boolean
      }
      is_trial_org: {
        Args: { orgid: string }
        Returns: number
      }
      mass_edit_queue_messages_cf_ids: {
        Args: {
          updates: Database["public"]["CompositeTypes"]["message_update"][]
        }
        Returns: undefined
      }
      modify_permissions_tmp: {
        Args: {
          email: string
          org_id: string
          new_role: Database["public"]["Enums"]["user_min_right"]
        }
        Returns: string
      }
      one_month_ahead: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      parse_cron_field: {
        Args: { field: string; current_val: number; max_val: number }
        Returns: number
      }
      parse_step_pattern: {
        Args: { pattern: string }
        Returns: number
      }
      process_admin_stats: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      process_cron_stats_jobs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      process_d1_replication_batch: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      process_failed_uploads: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      process_free_trial_expired: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      process_function_queue: {
        Args: { queue_name: string }
        Returns: number
      }
      process_stats_email_monthly: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      process_stats_email_weekly: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      process_subscribed_orgs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      read_bandwidth_usage: {
        Args: { p_app_id: string; p_period_start: string; p_period_end: string }
        Returns: {
          date: string
          bandwidth: number
          app_id: string
        }[]
      }
      read_device_usage: {
        Args: { p_app_id: string; p_period_start: string; p_period_end: string }
        Returns: {
          date: string
          mau: number
          app_id: string
        }[]
      }
      read_storage_usage: {
        Args: { p_app_id: string; p_period_start: string; p_period_end: string }
        Returns: {
          app_id: string
          date: string
          storage: number
        }[]
      }
      read_version_usage: {
        Args: { p_app_id: string; p_period_start: string; p_period_end: string }
        Returns: {
          app_id: string
          version_id: number
          date: string
          get: number
          fail: number
          install: number
          uninstall: number
        }[]
      }
      remove_old_jobs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      rescind_invitation: {
        Args: { email: string; org_id: string }
        Returns: string
      }
      set_bandwidth_exceeded_by_org: {
        Args: { org_id: string; disabled: boolean }
        Returns: undefined
      }
      set_mau_exceeded_by_org: {
        Args: { org_id: string; disabled: boolean }
        Returns: undefined
      }
      set_storage_exceeded_by_org: {
        Args: { org_id: string; disabled: boolean }
        Returns: undefined
      }
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
      upsert_version_meta: {
        Args: { p_app_id: string; p_version_id: number; p_size: number }
        Returns: boolean
      }
      verify_mfa: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      action_type: "mau" | "storage" | "bandwidth"
      app_mode: "prod" | "dev" | "livereload"
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
      action_type: ["mau", "storage", "bandwidth"],
      app_mode: ["prod", "dev", "livereload"],
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
