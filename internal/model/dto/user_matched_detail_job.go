package dto

import "github.com/gogf/gf/v2/os/gtime"

type UserMatchedDetailJob struct {
    Id               string      `json:"id" orm:"id" description:""` //
    UserId           string      `json:"userId" orm:"user_id" description:""` //
    Title            string      `json:"title" orm:"title" description:""` //
    JobDesc          string      `json:"jobDesc" orm:"job_desc" description:""` //
    JobTags          []string    `json:"jobTags" orm:"job_tags" description:""` //
    Link             string      `json:"link" orm:"link" description:""` //
    Source           string      `json:"source" orm:"source" description:""` //
    Location         string      `json:"location" orm:"location" description:""` //
    Salary           string      `json:"salary" orm:"salary" description:""` //
    UpdateTime       *gtime.Time `json:"updateTime" orm:"update_time" description:""` //
    JobDescEmbedding []float32   `json:"jobDescEmbedding" orm:"job_desc_embedding" description:""` //
}
