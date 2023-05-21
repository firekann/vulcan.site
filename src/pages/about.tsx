import { PageProps, graphql } from 'gatsby';
import React from 'react';

import Profile from '~/components/Profile';
import Seo from '~/components/Seo';
import { useSeo } from '~/hooks/useSeo';
import Layout from '~/layout';


const AboutPage = ({ data, location }: PageProps<GatsbyTypes.AboutPageQuery>) => {
  const siteMetadata = useSeo().site?.siteMetadata;

  const siteUrl = data.site?.siteMetadata?.siteUrl ?? '';
  const siteTitle = data.site?.siteMetadata?.title ?? '';
  const siteThumbnail = data.site?.siteMetadata?.thumbnail;

  const meta: Metadata[] = [];
  if (siteThumbnail) {
    const properties = ['og:image', 'twitter:image'];

    for (const property of properties) {
      meta.push({
        property,
        content: `${siteUrl}${siteThumbnail}`,
      });
    }
  }

  return (
    <Layout location={location} title={siteTitle}>
      <Seo
        lang='en'
        title={siteMetadata?.title ?? ''}
        description={siteMetadata?.description ?? ''}
        meta={meta}
        noSiteName
      />
      <Profile />
      <h1>I am</h1>
      <p>중앙대학교에서 소프트웨어를 전공중입니다. 보통 '불칸'이라는 아이디로 활동하고 있습니다.</p>
    </Layout>
  );
};

export default AboutPage;

export const pageQuery = graphql`
  query AboutPage {
    site {
      siteMetadata {
        title
        siteUrl
        thumbnail
      }
    }
  }
`;
