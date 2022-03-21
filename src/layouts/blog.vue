<script setup lang="ts">
import { IonContent, IonPage } from '@ionic/vue'
import { useRouter } from 'vue-router'
import type { Frontmatter } from '~/services/blog'
import { randomBlog, stringToDate } from '~/services/blog'

const router = useRouter()
const frontmatter: Frontmatter = router.currentRoute.value.meta.frontmatter as any
const random = randomBlog(router.currentRoute.value.path)
const meta = [
  { name: 'og:image:alt', content: frontmatter.head_image_alt },
  { name: 'og:alt', content: frontmatter.head_image_alt },
  { name: 'og:title', content: frontmatter.title },
  { name: 'og:description', content: frontmatter.description },
  { name: 'title', content: frontmatter.title },
  { name: 'description', content: frontmatter.description },
  { name: 'og:image', content: `https://${import.meta.env.domain}${frontmatter.head_image}` },
  { name: 'twitter:image', content: `https://${import.meta.env.domain}${frontmatter.head_image}` },
  { name: 'twitter:title', content: frontmatter.title },
  { name: 'twitter:description', content: frontmatter.description },
]
if (!frontmatter.published)
  meta.push({ name: 'robots', content: 'noindex, nofollow' })

useHead({
  meta,
})
</script>
<template>
  <IonPage>
    <IonContent :fullscreen="true">
      <main class="text-center text-gray-700 dark:text-gray-200">
        <Header />
        <div class="relative lg:pt-10 pb-4 lg:max-w-1/2 mx-auto">
          <div class="block aspect-w-4 aspect-h-3">
            <img class="object-cover w-full h-full lg:rounded-lg" :src="frontmatter.head_image" :alt="'blog illustration ' + frontmatter.title">
          </div>

          <div class="absolute top-4 left-4 lg:top-15 lg:left-10">
            <span class="px-4 py-2 text-xs font-semibold tracking-widest text-gray-900 uppercase bg-white rounded-full"> {{ frontmatter.tag }} </span>
          </div>
        </div>
        <span class="block mt-6 text-sm font-semibold tracking-widest text-gray-500 uppercase"> {{ stringToDate(frontmatter.date) }} </span>

        <h1 class="py-5 text-3xl lg:text-4xl lg:max-w-1/2 px-4 font-800 mx-auto">
          {{ frontmatter.title }}
        </h1>
        <p class="py-5 px-4 text-xl lg:max-w-1/2 mx-auto text-left">
          {{ frontmatter.description }}
        </p>
        <router-view class="pb-4 px-4 lg:max-w-1/2" />
        <a v-if="random" :href="random.path" class="flex flex-col sm:flex-row py-8 lg:max-w-1/2 mx-auto lg:my-10 bg-gray-800 lg:rounded-lg">
          <div class="relative mx-4 flex">
            <div :title="random.meta.frontmatter.title" class="block w-full">
              <img class="object-cover w-full sm:w-52 h-full rounded-lg" :src="random.meta.frontmatter.head_image" :alt="'blog illustration ' + random.meta.frontmatter.title">
            </div>

            <div class="absolute top-2 left-2">
              <span class="px-4 py-2 text-tiny font-semibold tracking-widest text-gray-900 uppercase bg-white rounded-full"> {{ random.meta.frontmatter.tag }} </span>
            </div>
          </div>
          <div class="px-4 pt-2 sm:pt-0 text-left">
            <p class="text-lg font-bold">
              {{ random.meta.frontmatter.title }}
            </p>
            <span class="block mt-3 text-sm font-semibold tracking-widest text-gray-500 uppercase"> {{ stringToDate(random.meta.frontmatter.date) }} </span>
            <p class="mt-1">
              {{ random.meta.frontmatter.description }}
            </p>
          </div>
        </a>
        <Footer />
      </main>
    </IonContent>
  </IonPage>
</template>
