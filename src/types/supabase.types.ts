export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      apikeys: {
        Row: {
          created_at: string | null
          id: number
          key: string
          mode: Database["public"]["Enums"]["key_mode"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          key: string
          mode: Database["public"]["Enums"]["key_mode"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          key?: string
          mode?: Database["public"]["Enums"]["key_mode"]
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
      app_stats: {
        Row: {
          app_id: string
          bandwidth: number
          channels: number
          created_at: string | null
          date_id: string
          devices: number
          devices_real: number
          mlu: number
          mlu_real: number
          shared: number
          updated_at: string | null
          user_id: string
          version_size: number
          versions: number
        }
        Insert: {
          app_id: string
          bandwidth?: number
          channels?: number
          created_at?: string | null
          date_id?: string
          devices?: number
          devices_real?: number
          mlu?: number
          mlu_real?: number
          shared?: number
          updated_at?: string | null
          user_id: string
          version_size?: number
          versions?: number
        }
        Update: {
          app_id?: string
          bandwidth?: number
          channels?: number
          created_at?: string | null
          date_id?: string
          devices?: number
          devices_real?: number
          mlu?: number
          mlu_real?: number
          shared?: number
          updated_at?: string | null
          user_id?: string
          version_size?: number
          versions?: number
        }
        Relationships: [
          {
            foreignKeyName: "app_stats_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "app_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_usage: {
        Row: {
          app_id: string
          bandwidth: number
          date: string | null
          fails: number
          get: number
          id: string
          install: number
          mau: number
          storage_added: number
          storage_deleted: number
          uninstall: number
        }
        Insert: {
          app_id: string
          bandwidth?: number
          date?: string | null
          fails?: number
          get?: number
          id?: string
          install?: number
          mau?: number
          storage_added?: number
          storage_deleted?: number
          uninstall?: number
        }
        Update: {
          app_id?: string
          bandwidth?: number
          date?: string | null
          fails?: number
          get?: number
          id?: string
          install?: number
          mau?: number
          storage_added?: number
          storage_deleted?: number
          uninstall?: number
        }
        Relationships: []
      }
      app_versions: {
        Row: {
          app_id: string
          bucket_id: string | null
          checksum: string | null
          created_at: string | null
          deleted: boolean
          external_url: string | null
          id: number
          minUpdateVersion: string | null
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
          bucket_id?: string | null
          checksum?: string | null
          created_at?: string | null
          deleted?: boolean
          external_url?: string | null
          id?: number
          minUpdateVersion?: string | null
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
          bucket_id?: string | null
          checksum?: string | null
          created_at?: string | null
          deleted?: boolean
          external_url?: string | null
          id?: number
          minUpdateVersion?: string | null
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
          icon_url: string
          id: string | null
          last_version: string | null
          name: string | null
          owner_org: string
          retention: number
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          app_id: string
          created_at?: string | null
          icon_url: string
          id?: string | null
          last_version?: string | null
          name?: string | null
          owner_org: string
          retention?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          app_id?: string
          created_at?: string | null
          icon_url?: string
          id?: string | null
          last_version?: string | null
          name?: string | null
          owner_org?: string
          retention?: number
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
      auth_uid: {
        Row: {
          uid: string | null
        }
        Insert: {
          uid?: string | null
        }
        Update: {
          uid?: string | null
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
          beta: boolean
          created_at: string
          created_by: string | null
          disableAutoUpdate: Database["public"]["Enums"]["disable_update"]
          disableAutoUpdateUnderNative: boolean
          enable_progressive_deploy: boolean
          enableAbTesting: boolean
          id: number
          ios: boolean
          name: string
          owner_org: string
          public: boolean
          secondaryVersionPercentage: number
          secondVersion: number | null
          updated_at: string
          version: number
        }
        Insert: {
          allow_dev?: boolean
          allow_device_self_set?: boolean
          allow_emulator?: boolean
          android?: boolean
          app_id: string
          beta?: boolean
          created_at?: string
          created_by?: string | null
          disableAutoUpdate?: Database["public"]["Enums"]["disable_update"]
          disableAutoUpdateUnderNative?: boolean
          enable_progressive_deploy?: boolean
          enableAbTesting?: boolean
          id?: number
          ios?: boolean
          name: string
          owner_org: string
          public?: boolean
          secondaryVersionPercentage?: number
          secondVersion?: number | null
          updated_at?: string
          version: number
        }
        Update: {
          allow_dev?: boolean
          allow_device_self_set?: boolean
          allow_emulator?: boolean
          android?: boolean
          app_id?: string
          beta?: boolean
          created_at?: string
          created_by?: string | null
          disableAutoUpdate?: Database["public"]["Enums"]["disable_update"]
          disableAutoUpdateUnderNative?: boolean
          enable_progressive_deploy?: boolean
          enableAbTesting?: boolean
          id?: number
          ios?: boolean
          name?: string
          owner_org?: string
          public?: boolean
          secondaryVersionPercentage?: number
          secondVersion?: number | null
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
            foreignKeyName: "channels_secondVersion_fkey"
            columns: ["secondVersion"]
            isOneToOne: false
            referencedRelation: "app_versions"
            referencedColumns: ["id"]
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
      clickhouse_app_usage: {
        Row: {
          app_id: string | null
          bandwidth: number | null
          date: string | null
          fail: number | null
          get: number | null
          install: number | null
          mau: number | null
          storage_added: number | null
          storage_deleted: number | null
          uninstall: number | null
        }
        Insert: {
          app_id?: string | null
          bandwidth?: number | null
          date?: string | null
          fail?: number | null
          get?: number | null
          install?: number | null
          mau?: number | null
          storage_added?: number | null
          storage_deleted?: number | null
          uninstall?: number | null
        }
        Update: {
          app_id?: string | null
          bandwidth?: number | null
          date?: string | null
          fail?: number | null
          get?: number | null
          install?: number | null
          mau?: number | null
          storage_added?: number | null
          storage_deleted?: number | null
          uninstall?: number | null
        }
        Relationships: []
      }
      clickhouse_app_usage_parm: {
        Row: {
          _app_list: string | null
          _end_date: string | null
          _start_date: string | null
          app_id: string | null
          bandwidth: number | null
          date: string | null
          fail: number | null
          get: number | null
          install: number | null
          mau: number | null
          storage_added: number | null
          storage_deleted: number | null
          uninstall: number | null
        }
        Insert: {
          _app_list?: string | null
          _end_date?: string | null
          _start_date?: string | null
          app_id?: string | null
          bandwidth?: number | null
          date?: string | null
          fail?: number | null
          get?: number | null
          install?: number | null
          mau?: number | null
          storage_added?: number | null
          storage_deleted?: number | null
          uninstall?: number | null
        }
        Update: {
          _app_list?: string | null
          _end_date?: string | null
          _start_date?: string | null
          app_id?: string | null
          bandwidth?: number | null
          date?: string | null
          fail?: number | null
          get?: number | null
          install?: number | null
          mau?: number | null
          storage_added?: number | null
          storage_deleted?: number | null
          uninstall?: number | null
        }
        Relationships: []
      }
      clickhouse_devices: {
        Row: {
          app_id: string | null
          created_at: string | null
          custom_id: string | null
          device_id: string | null
          is_emulator: boolean | null
          is_prod: boolean | null
          os_version: string | null
          platform: string | null
          plugin_version: string | null
          updated_at: string | null
          version: number | null
          version_build: string | null
        }
        Insert: {
          app_id?: string | null
          created_at?: string | null
          custom_id?: string | null
          device_id?: string | null
          is_emulator?: boolean | null
          is_prod?: boolean | null
          os_version?: string | null
          platform?: string | null
          plugin_version?: string | null
          updated_at?: string | null
          version?: number | null
          version_build?: string | null
        }
        Update: {
          app_id?: string | null
          created_at?: string | null
          custom_id?: string | null
          device_id?: string | null
          is_emulator?: boolean | null
          is_prod?: boolean | null
          os_version?: string | null
          platform?: string | null
          plugin_version?: string | null
          updated_at?: string | null
          version?: number | null
          version_build?: string | null
        }
        Relationships: []
      }
      clickhouse_logs: {
        Row: {
          action: string | null
          app_id: string | null
          created_at: string | null
          device_id: string | null
          platform: string | null
          version: number | null
          version_build: string | null
        }
        Insert: {
          action?: string | null
          app_id?: string | null
          created_at?: string | null
          device_id?: string | null
          platform?: string | null
          version?: number | null
          version_build?: string | null
        }
        Update: {
          action?: string | null
          app_id?: string | null
          created_at?: string | null
          device_id?: string | null
          platform?: string | null
          version?: number | null
          version_build?: string | null
        }
        Relationships: []
      }
      cycle_info: {
        Row: {
          subscription_anchor_end: string | null
          subscription_anchor_start: string | null
        }
        Insert: {
          subscription_anchor_end?: string | null
          subscription_anchor_start?: string | null
        }
        Update: {
          subscription_anchor_end?: string | null
          subscription_anchor_start?: string | null
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
      devices: {
        Row: {
          app_id: string
          created_at: string
          custom_id: string
          device_id: string
          is_emulator: boolean | null
          is_prod: boolean | null
          os_version: string | null
          platform: Database["public"]["Enums"]["platform_os"] | null
          plugin_version: string
          updated_at: string
          version: number
          version_build: string | null
        }
        Insert: {
          app_id: string
          created_at: string
          custom_id?: string
          device_id: string
          is_emulator?: boolean | null
          is_prod?: boolean | null
          os_version?: string | null
          platform?: Database["public"]["Enums"]["platform_os"] | null
          plugin_version?: string
          updated_at: string
          version: number
          version_build?: string | null
        }
        Update: {
          app_id?: string
          created_at?: string
          custom_id?: string
          device_id?: string
          is_emulator?: boolean | null
          is_prod?: boolean | null
          os_version?: string | null
          platform?: Database["public"]["Enums"]["platform_os"] | null
          plugin_version?: string
          updated_at?: string
          version?: number
          version_build?: string | null
        }
        Relationships: []
      }
      devices_override: {
        Row: {
          app_id: string
          created_at: string | null
          device_id: string
          id: number
          owner_org: string
          updated_at: string | null
          version: number
        }
        Insert: {
          app_id: string
          created_at?: string | null
          device_id: string
          id?: number
          owner_org: string
          updated_at?: string | null
          version: number
        }
        Update: {
          app_id?: string
          created_at?: string | null
          device_id?: string
          id?: number
          owner_org?: string
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "devices_override_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "devices_override_version_fkey"
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
      global_stats: {
        Row: {
          apps: number
          apps_active: number | null
          created_at: string | null
          date_id: string
          need_upgrade: number | null
          not_paying: number | null
          onboarded: number | null
          paying: number | null
          paying_monthly: number | null
          paying_yearly: number | null
          stars: number
          trial: number | null
          updates: number
          users: number | null
          users_active: number | null
        }
        Insert: {
          apps: number
          apps_active?: number | null
          created_at?: string | null
          date_id: string
          need_upgrade?: number | null
          not_paying?: number | null
          onboarded?: number | null
          paying?: number | null
          paying_monthly?: number | null
          paying_yearly?: number | null
          stars: number
          trial?: number | null
          updates: number
          users?: number | null
          users_active?: number | null
        }
        Update: {
          apps?: number
          apps_active?: number | null
          created_at?: string | null
          date_id?: string
          need_upgrade?: number | null
          not_paying?: number | null
          onboarded?: number | null
          paying?: number | null
          paying_monthly?: number | null
          paying_yearly?: number | null
          stars?: number
          trial?: number | null
          updates?: number
          users?: number | null
          users_active?: number | null
        }
        Relationships: []
      }
      job_queue: {
        Row: {
          created_at: string | null
          extra_info: Json
          function_name: string | null
          function_type: string | null
          job_id: number
          job_type: string
          payload: string
          request_id: number | null
          status: Database["public"]["Enums"]["queue_job_status"]
        }
        Insert: {
          created_at?: string | null
          extra_info?: Json
          function_name?: string | null
          function_type?: string | null
          job_id?: number
          job_type: string
          payload: string
          request_id?: number | null
          status?: Database["public"]["Enums"]["queue_job_status"]
        }
        Update: {
          created_at?: string | null
          extra_info?: Json
          function_name?: string | null
          function_type?: string | null
          job_id?: number
          job_type?: string
          payload?: string
          request_id?: number | null
          status?: Database["public"]["Enums"]["queue_job_status"]
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          last_send_at: string
          total_send: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id: string
          last_send_at?: string
          total_send?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_send_at?: string
          total_send?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          id: string
          logo: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          logo?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          logo?: string | null
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
          action: string
          app_id: string
          created_at: string
          device_id: string
          platform: Database["public"]["Enums"]["platform_os"]
          version: number
          version_build: string
        }
        Insert: {
          action: string
          app_id: string
          created_at: string
          device_id: string
          platform: Database["public"]["Enums"]["platform_os"]
          version: number
          version_build: string
        }
        Update: {
          action?: string
          app_id?: string
          created_at?: string
          device_id?: string
          platform?: Database["public"]["Enums"]["platform_os"]
          version?: number
          version_build?: string
        }
        Relationships: []
      }
      stripe_info: {
        Row: {
          created_at: string
          customer_id: string
          is_good_plan: boolean | null
          plan_usage: number | null
          price_id: string | null
          product_id: string
          status: Database["public"]["Enums"]["stripe_status"] | null
          subscription_anchor_end: string
          subscription_anchor_start: string
          subscription_id: string | null
          subscription_metered: Json
          trial_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          is_good_plan?: boolean | null
          plan_usage?: number | null
          price_id?: string | null
          product_id?: string
          status?: Database["public"]["Enums"]["stripe_status"] | null
          subscription_anchor_end?: string
          subscription_anchor_start?: string
          subscription_id?: string | null
          subscription_metered?: Json
          trial_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          is_good_plan?: boolean | null
          plan_usage?: number | null
          price_id?: string | null
          product_id?: string
          status?: Database["public"]["Enums"]["stripe_status"] | null
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
      users: {
        Row: {
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
          {
            foreignKeyName: "users_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          id: number
          locked: boolean
        }
        Insert: {
          id?: number
          locked?: boolean
        }
        Update: {
          id?: number
          locked?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation_to_org: {
        Args: {
          org_id: string
        }
        Returns: string
      }
      calculate_cycle_usage: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      calculate_daily_app_usage: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      check_min_rights:
        | {
            Args: {
              min_right: Database["public"]["Enums"]["user_min_right"]
              org_id: string
              app_id: string
              channel_id: number
            }
            Returns: boolean
          }
        | {
            Args: {
              min_right: Database["public"]["Enums"]["user_min_right"]
              user_id: string
              org_id: string
              app_id: string
              channel_id: number
            }
            Returns: boolean
          }
      convert_bytes_to_gb: {
        Args: {
          byt: number
        }
        Returns: number
      }
      convert_bytes_to_mb: {
        Args: {
          byt: number
        }
        Returns: number
      }
      convert_gb_to_bytes: {
        Args: {
          gb: number
        }
        Returns: number
      }
      convert_mb_to_bytes: {
        Args: {
          gb: number
        }
        Returns: number
      }
      convert_number_to_percent: {
        Args: {
          val: number
          max_val: number
        }
        Returns: number
      }
      count_active_users: {
        Args: {
          app_ids: string[]
        }
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
      count_all_paying: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      count_all_plans: {
        Args: Record<PropertyKey, never>
        Returns: {
          product_id: string
          count: number
        }[]
      }
      count_all_plans_v2: {
        Args: Record<PropertyKey, never>
        Returns: {
          plan_name: string
          count: number
        }[]
      }
      count_all_trial: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      create_partitions: {
        Args: {
          start_date: string
          num_years: number
        }
        Returns: undefined
      }
      delete_user: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      exist_app_v2: {
        Args: {
          appid: string
        }
        Returns: boolean
      }
      exist_app_versions: {
        Args: {
          appid: string
          name_version: string
          apikey: string
        }
        Returns: boolean
      }
      exist_user: {
        Args: {
          e_mail: string
        }
        Returns: string
      }
      find_best_plan_v3: {
        Args: {
          mau: number
          bandwidth: number
          storage: number
        }
        Returns: string
      }
      find_fit_plan_v3: {
        Args: {
          mau: number
          bandwidth: number
          storage: number
        }
        Returns: {
          name: string
        }[]
      }
      get_apikey: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_app_versions: {
        Args: {
          appid: string
          name_version: string
          apikey: string
        }
        Returns: number
      }
      get_current_plan_max:
        | {
            Args: Record<PropertyKey, never>
            Returns: string
          }
        | {
            Args: {
              userid: string
            }
            Returns: {
              mau: number
              bandwidth: number
              storage: number
            }[]
          }
      get_current_plan_name:
        | {
            Args: Record<PropertyKey, never>
            Returns: string
          }
        | {
            Args: {
              userid: string
            }
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
      get_cycle_info:
        | {
            Args: Record<PropertyKey, never>
            Returns: {
              subscription_anchor_start: string
              subscription_anchor_end: string
            }[]
          }
        | {
            Args: {
              userid: string
            }
            Returns: {
              subscription_anchor_start: string
              subscription_anchor_end: string
            }[]
          }
      get_db_url: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_devices_version: {
        Args: {
          app_id: string
          version_id: number
        }
        Returns: number
      }
      get_external_function_url: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_identity:
        | {
            Args: Record<PropertyKey, never>
            Returns: string
          }
        | {
            Args: {
              keymode: Database["public"]["Enums"]["key_mode"][]
            }
            Returns: string
          }
      get_identity_apikey_only: {
        Args: {
          keymode: Database["public"]["Enums"]["key_mode"][]
        }
        Returns: string
      }
      get_infos: {
        Args: {
          appid: string
          deviceid: string
          versionname: string
        }
        Returns: {
          current_version_id: number
          versiondata: Json
          channel: Json
        }[]
      }
      get_max_plan:
        | {
            Args: Record<PropertyKey, never>
            Returns: {
              mau: number
              bandwidth: number
              storage: number
            }[]
          }
        | {
            Args: {
              userid: string
            }
            Returns: {
              mau: number
              storage: number
              bandwidth: number
            }[]
          }
      get_metered_usage:
        | {
            Args: Record<PropertyKey, never>
            Returns: number
          }
        | {
            Args: {
              userid: string
            }
            Returns: Database["public"]["CompositeTypes"]["stats_table"]
          }
      get_org_members: {
        Args: {
          guild_id: string
        }
        Returns: {
          aid: number
          uid: string
          email: string
          image_url: string
          role: Database["public"]["Enums"]["user_min_right"]
        }[]
      }
      get_org_perm_for_apikey: {
        Args: {
          apikey: string
          app_id: string
        }
        Returns: string
      }
      get_orgs_v2: {
        Args: {
          userid: string
        }
        Returns: {
          gid: string
          created_by: string
          logo: string
          name: string
          role: string
        }[]
      }
      get_orgs_v3: {
        Args: {
          userid: string
        }
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
        }[]
      }
      get_orgs_v4:
        | {
            Args: Record<PropertyKey, never>
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
            }[]
          }
        | {
            Args: {
              userid: string
            }
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
            }[]
          }
      get_plan_usage_percent: {
        Args: {
          userid: string
        }
        Returns: number
      }
      get_total_app_storage_size:
        | {
            Args: {
              appid: string
            }
            Returns: number
          }
        | {
            Args: {
              userid: string
              appid: string
            }
            Returns: number
          }
      get_total_app_storage_size_orgs: {
        Args: {
          org_id: string
          app_id: string
        }
        Returns: number
      }
      get_total_stats_v5: {
        Args: {
          userid: string
        }
        Returns: {
          mau: number
          bandwidth: number
          storage: number
        }[]
      }
      get_total_storage_size:
        | {
            Args: Record<PropertyKey, never>
            Returns: number
          }
        | {
            Args: {
              appid: string
            }
            Returns: number
          }
        | {
            Args: {
              userid: string
            }
            Returns: number
          }
        | {
            Args: {
              userid: string
              appid: string
            }
            Returns: number
          }
      get_total_storage_size_org: {
        Args: {
          org_id: string
        }
        Returns: number
      }
      get_usage_mode_and_last_saved: {
        Args: Record<PropertyKey, never>
        Returns: {
          usage_mode: Database["public"]["Enums"]["usage_mode"]
          last_saved: string
        }[]
      }
      get_user_id:
        | {
            Args: {
              apikey: string
            }
            Returns: string
          }
        | {
            Args: {
              apikey: string
              app_id: string
            }
            Returns: string
          }
      get_user_main_org_id: {
        Args: {
          user_id: string
        }
        Returns: string
      }
      get_user_main_org_id_by_app_id: {
        Args: {
          app_id: string
        }
        Returns: string
      }
      get_weekly_stats: {
        Args: {
          app_id: string
        }
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
      has_app_right_userid: {
        Args: {
          appid: string
          right: Database["public"]["Enums"]["user_min_right"]
          userid: string
        }
        Returns: boolean
      }
      has_min_right: {
        Args: {
          _userid: string
          _orgid: string
          _right: Database["public"]["Enums"]["user_min_right"]
          _appid?: string
          _channelid?: number
        }
        Returns: boolean
      }
      has_read_rights: {
        Args: {
          appid: string
        }
        Returns: boolean
      }
      http_post_helper: {
        Args: {
          function_name: string
          function_type: string
          body: Json
        }
        Returns: number
      }
      invite_user_to_org: {
        Args: {
          email: string
          org_id: string
          invite_type: Database["public"]["Enums"]["user_min_right"]
        }
        Returns: string
      }
      is_admin:
        | {
            Args: Record<PropertyKey, never>
            Returns: boolean
          }
        | {
            Args: {
              userid: string
            }
            Returns: boolean
          }
      is_allowed_action:
        | {
            Args: {
              apikey: string
            }
            Returns: boolean
          }
        | {
            Args: {
              apikey: string
              appid: string
            }
            Returns: boolean
          }
      is_allowed_action_user:
        | {
            Args: Record<PropertyKey, never>
            Returns: boolean
          }
        | {
            Args: {
              userid: string
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
              keymode: Database["public"]["Enums"]["key_mode"][]
              app_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              apikey: string
              keymode: Database["public"]["Enums"]["key_mode"][]
              app_id: string
              channel_id: number
              right: Database["public"]["Enums"]["user_min_right"]
              user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              apikey: string
              keymode: Database["public"]["Enums"]["key_mode"][]
              app_id: string
              right: Database["public"]["Enums"]["user_min_right"]
              user_id: string
            }
            Returns: boolean
          }
      is_app_owner:
        | {
            Args: {
              apikey: string
              appid: string
            }
            Returns: boolean
          }
        | {
            Args: {
              appid: string
            }
            Returns: boolean
          }
        | {
            Args: {
              userid: string
              appid: string
            }
            Returns: boolean
          }
      is_canceled:
        | {
            Args: Record<PropertyKey, never>
            Returns: boolean
          }
        | {
            Args: {
              userid: string
            }
            Returns: boolean
          }
      is_free_usage:
        | {
            Args: Record<PropertyKey, never>
            Returns: boolean
          }
        | {
            Args: {
              userid: string
            }
            Returns: boolean
          }
      is_good_plan_v3: {
        Args: {
          userid: string
        }
        Returns: boolean
      }
      is_good_plan_v5: {
        Args: {
          userid: string
        }
        Returns: boolean
      }
      is_member_of_org: {
        Args: {
          user_id: string
          org_id: string
        }
        Returns: boolean
      }
      is_not_deleted: {
        Args: {
          email_check: string
        }
        Returns: boolean
      }
      is_onboarded:
        | {
            Args: Record<PropertyKey, never>
            Returns: boolean
          }
        | {
            Args: {
              userid: string
            }
            Returns: boolean
          }
      is_onboarding_needed:
        | {
            Args: Record<PropertyKey, never>
            Returns: boolean
          }
        | {
            Args: {
              userid: string
            }
            Returns: boolean
          }
      is_owner_of_org: {
        Args: {
          user_id: string
          org_id: string
        }
        Returns: boolean
      }
      is_paying:
        | {
            Args: Record<PropertyKey, never>
            Returns: boolean
          }
        | {
            Args: {
              userid: string
            }
            Returns: boolean
          }
      is_paying_and_good_plan:
        | {
            Args: Record<PropertyKey, never>
            Returns: boolean
          }
        | {
            Args: {
              userid: string
            }
            Returns: boolean
          }
      is_trial:
        | {
            Args: Record<PropertyKey, never>
            Returns: number
          }
        | {
            Args: {
              userid: string
            }
            Returns: number
          }
      one_month_ahead: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      post_replication_sql:
        | {
            Args: {
              sql_query: string
            }
            Returns: undefined
          }
        | {
            Args: {
              sql_query: string
              params: string[]
            }
            Returns: undefined
          }
      process_current_jobs_if_unlocked: {
        Args: Record<PropertyKey, never>
        Returns: number[]
      }
      process_requested_jobs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      reset_and_seed_data: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      retry_failed_jobs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      schedule_jobs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      update_app_usage:
        | {
            Args: Record<PropertyKey, never>
            Returns: undefined
          }
        | {
            Args: {
              minutes_interval: number
            }
            Returns: undefined
          }
      verify_mfa: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      app_mode: "prod" | "dev" | "livereload"
      disable_update: "major" | "minor" | "version_number" | "none"
      key_mode: "read" | "write" | "all" | "upload"
      pay_as_you_go_type: "base" | "units"
      platform_os: "ios" | "android"
      queue_job_status: "inserted" | "requested" | "failed"
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
    }
    CompositeTypes: {
      match_plan: {
        name: string | null
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

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never
